"""Multi-source AIS aggregator: three independent first-class providers, one vessel picture.

Architecture (no provider is primary, secondary or fallback of another):

    OpenWatersProvider ──┐
                         ├─► Common Normalizer ─► MultiSourceAggregator ─► API/UI
    AISStreamProvider  ──┤
                         │
    VesselApiProvider  ──┘

Deduplication: MMSI is the vessel identity. When several providers report the
same MMSI, the freshest valid position wins, but provenance is preserved:

    {"source": "VESSELAPI", "sources": ["AISSTREAM", "OPENWATERS", "VESSELAPI"],
     "source_last_seen": {"AISSTREAM": ..., "OPENWATERS": ..., "VESSELAPI": ...}}

Provider workers are consumed read-only here; their behavior, diagnostics,
reconnect loops, sweeps and track histories are untouched.
"""
from __future__ import annotations

import time
from datetime import datetime, timezone

from app.services.ais_normalize import SOURCE_AISSTREAM, SOURCE_OPENWATERS, SOURCE_VESSELAPI
from app.services import aisstream as _as
from app.services import openwaters as _ow
from app.services import vesselapi as _va

FRESH_LIVE_S = _as.FRESH_LIVE_S
FRESH_RECENT_S = _as.FRESH_RECENT_S


def _iso(ts):
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat() if ts else None


def _provider_to_snapshot_shape(rec: dict, ports: list[dict], now: float) -> dict:
    """Associate one Open Waters / VesselAPI record with shared port/radius logic."""
    source = rec.get("source") or SOURCE_OPENWATERS
    lat, lon = rec["latitude"], rec["longitude"]
    age = now - float(rec.get("last_seen") or now)
    state = "LIVE" if age < FRESH_LIVE_S else ("RECENT" if age < FRESH_RECENT_S else "STALE")
    best, best_d = None, float("inf")
    for p in ports:
        d = _as._haversine(lat, lon, p["latitude"], p["longitude"])
        if d < best_d:
            best, best_d = p, d
    assoc = _as.AisStreamService._associate(
        {"latitude": lat, "longitude": lon, "cog": rec.get("cog"), "sog": rec.get("sog")},
        best, best_d)
    track = [{"lat": float(p["lat"]), "lon": float(p["lon"]), "ts": float(p["ts"])}
             for p in (rec.get("track") or [])]
    observed = track[:-1] if (track and abs(track[-1]["lat"] - lat) < 1e-9
                              and abs(track[-1]["lon"] - lon) < 1e-9) else track
    return {
        "mmsi": rec["mmsi"], "ship_name": rec.get("vessel_name"),
        "latitude": lat, "longitude": lon,
        "sog": rec.get("sog"), "cog": rec.get("cog"), "heading": rec.get("heading"),
        "nav_status": rec.get("nav_status"), "timestamp": rec.get("timestamp"),
        "processed_timestamp": rec.get("processed_timestamp"),
        "message_type": rec.get("message_type"), "received_at": None,
        "last_seen": rec.get("last_seen"), "data_age_seconds": round(age, 1),
        "freshness": state, "source": source,
        "sources": [source],
        "source_last_seen": {source: _iso(rec.get("last_seen"))},
        "associated_port_id": best["port_id"] if best_d <= _as.PORT_RADIUS_KM else None,
        "associated_port_name": best["port_name"] if best_d <= _as.PORT_RADIUS_KM else None,
        "distance_to_port_km": round(best_d, 2),
        "nearest_port_id": best["port_id"] if best else None,
        "nearest_port_name": best["port_name"] if best else None,
        "vessel_status": assoc,
        "ais_destination": rec.get("destination"),
        "ship_type": rec.get("ship_type"), "imo": rec.get("imo"),
        "track": observed[-(_as.MAX_TRACK_PTS - 1):],
        "track_points": len(observed),
        "ais_class": rec.get("ais_class"),
        "source_station": rec.get("source_station"),
        "upstream_source": rec.get("upstream_source"),
    }


# Backwards-compatible alias (Open Waters path unchanged).
def _ow_to_snapshot_shape(rec: dict, ports: list[dict], now: float) -> dict:
    return _provider_to_snapshot_shape(rec, ports, now)


def _merge_tracks(a: list, b: list, limit: int) -> list:
    seen = set()
    merged = []
    for pt in (a or []) + (b or []):
        try:
            key = (round(float(pt["lat"]), 5), round(float(pt["lon"]), 5), round(float(pt["ts"])))
        except (TypeError, ValueError, KeyError):
            continue
        if key not in seen:
            seen.add(key)
            merged.append({"lat": float(pt["lat"]), "lon": float(pt["lon"]), "ts": float(pt["ts"])})
    merged.sort(key=lambda p: p["ts"])
    return merged[-limit:]


def _merge_one(cur: dict, nxt: dict) -> dict:
    """Merge one additional provider record into an accumulated vessel."""
    try:
        nxt_age = float(nxt.get("last_seen") or 0)
        cur_age = float(cur.get("last_seen") or 0)
    except (TypeError, ValueError):
        nxt_age, cur_age = 0, 0
    # Freshest valid position wins; provenance unions regardless.
    if nxt_age >= cur_age and nxt.get("latitude") is not None:
        keep_pos, keep_meta = nxt, cur
    else:
        keep_pos, keep_meta = cur, nxt
    merged = dict(keep_pos)
    merged["sources"] = sorted(set(keep_pos.get("sources", []) + keep_meta.get("sources", [])))
    sls = dict(keep_pos.get("source_last_seen") or {})
    sls.update(keep_meta.get("source_last_seen") or {})
    merged["source_last_seen"] = sls
    merged["track"] = _merge_tracks(cur.get("track"), nxt.get("track"), _as.MAX_TRACK_PTS - 1)
    merged["track_points"] = len(merged["track"])
    # Fill static gaps from either side (names, destination, type...).
    for k in ("ship_name", "ais_destination", "ship_type", "imo",
              "source_station", "upstream_source", "ais_class"):
        if merged.get(k) is None and keep_meta.get(k) is not None:
            merged[k] = keep_meta[k]
    return merged


def _seed_snapshot(v: dict, source: str) -> dict:
    c = dict(v)
    if not isinstance(c.get("sources"), list) or not c["sources"]:
        c["sources"] = [source]
    sls = dict(c.get("source_last_seen") or {})
    sls.setdefault(source, v.get("received_at") or v.get("timestamp"))
    c["source_last_seen"] = sls
    return c


def merge_many(snapshots: dict[str, list[dict]]) -> tuple[list[dict], dict]:
    """Merge N provider snapshots by MMSI. Freshest valid position wins.

    Returns (vessels, stats) with per-provider, pairwise, only- and
    multi-source counts. Pure function — fully unit-testable.
    """
    by_mmsi: dict[int, dict] = {}
    for source, snap in snapshots.items():
        for v in snap or []:
            try:
                m = int(v["mmsi"])
            except (TypeError, ValueError):
                continue
            if m in by_mmsi:
                by_mmsi[m] = _merge_one(by_mmsi[m], _seed_snapshot(v, source))
            else:
                by_mmsi[m] = _seed_snapshot(v, source)
    vessels = list(by_mmsi.values())
    has = lambda v, s: s in (v.get("sources") or [])
    ow = sum(1 for v in vessels if has(v, SOURCE_OPENWATERS))
    as_ = sum(1 for v in vessels if has(v, SOURCE_AISSTREAM))
    va = sum(1 for v in vessels if has(v, SOURCE_VESSELAPI))
    ow_as = sum(1 for v in vessels if has(v, SOURCE_OPENWATERS) and has(v, SOURCE_AISSTREAM))
    ow_va = sum(1 for v in vessels if has(v, SOURCE_OPENWATERS) and has(v, SOURCE_VESSELAPI))
    as_va = sum(1 for v in vessels if has(v, SOURCE_AISSTREAM) and has(v, SOURCE_VESSELAPI))
    all3 = sum(1 for v in vessels if has(v, SOURCE_OPENWATERS) and has(v, SOURCE_AISSTREAM) and has(v, SOURCE_VESSELAPI))
    multi = sum(1 for v in vessels if len(v.get("sources") or []) >= 2)
    stats = {"unique_vessels": len(vessels),
             "from_openwaters": ow, "from_aisstream": as_, "from_vesselapi": va,
             "from_both": multi,
             "from_openwaters_aisstream": ow_as,
             "from_openwaters_vesselapi": ow_va,
             "from_aisstream_vesselapi": as_va,
             "from_all_three": all3,
             "from_two_sources": multi - all3,
             "openwaters_only": sum(1 for v in vessels if (v.get("sources") or []) == [SOURCE_OPENWATERS]),
             "aisstream_only": sum(1 for v in vessels if (v.get("sources") or []) == [SOURCE_AISSTREAM]),
             "vesselapi_only": sum(1 for v in vessels if (v.get("sources") or []) == [SOURCE_VESSELAPI])}
    return vessels, stats


def merge_vessels(as_snap: list[dict], ow_snap: list[dict]) -> tuple[list[dict], dict]:
    """Two-provider merge. Freshest valid position wins.

    Kept for backwards compatibility; delegates to merge_many.
    Returns (vessels, stats). Pure function — fully unit-testable.
    """
    return merge_many({SOURCE_AISSTREAM: as_snap, SOURCE_OPENWATERS: ow_snap})


class MultiSourceAggregator:
    """Owns no sockets. Starts/stops all three provider workers independently."""

    def start(self):
        out = {}
        try:
            out["aisstream"] = _as.SERVICE.start()
        except Exception as exc:
            out["aisstream"] = {"started": False, "reason": f"{type(exc).__name__}"}
        try:
            out["openwaters"] = _ow.SERVICE.start()
        except Exception as exc:
            out["openwaters"] = {"started": False, "reason": f"{type(exc).__name__}"}
        try:
            out["vesselapi"] = _va.SERVICE.start()
        except Exception as exc:
            out["vesselapi"] = {"started": False, "reason": f"{type(exc).__name__}"}
        return out

    def stop(self):
        try:
            _as.SERVICE.stop()
        except Exception:
            pass
        try:
            _ow.SERVICE.stop()
        except Exception:
            pass
        try:
            _va.SERVICE.stop()
        except Exception:
            pass

    def _provider_snaps(self, max_age_s: float | None = None):
        """Collect per-provider snapshots. One provider's failure never
        affects the others: each is guarded independently."""
        as_snap = _as.SERVICE.snapshot(max_age_s=max_age_s)
        try:
            ports = _as.SERVICE.ports()
        except Exception:
            ports = []
        now = time.time()

        def shaped(service, source):
            out = []
            try:
                recs = service.snapshot_records()
            except Exception:
                return out
            for rec in recs:
                try:
                    if max_age_s is not None and (now - float(rec.get("last_seen") or 0)) > max_age_s:
                        continue
                    out.append(_provider_to_snapshot_shape(rec, ports, now))
                except Exception:
                    continue
            return out

        ow_snap = shaped(_ow.SERVICE, SOURCE_OPENWATERS)
        va_snap = shaped(_va.SERVICE, SOURCE_VESSELAPI)
        return as_snap, ow_snap, va_snap

    def snapshot(self, max_age_s: float | None = None) -> list[dict]:
        as_snap, ow_snap, va_snap = self._provider_snaps(max_age_s=max_age_s)
        vessels, _ = merge_many({SOURCE_AISSTREAM: as_snap,
                                 SOURCE_OPENWATERS: ow_snap,
                                 SOURCE_VESSELAPI: va_snap})
        return vessels

    def aggregation_stats(self) -> dict:
        as_snap, ow_snap, va_snap = self._provider_snaps()
        vessels, stats = merge_many({SOURCE_AISSTREAM: as_snap,
                                     SOURCE_OPENWATERS: ow_snap,
                                     SOURCE_VESSELAPI: va_snap})
        live = sum(1 for v in vessels if v.get("freshness") == "LIVE")
        stale = sum(1 for v in vessels if v.get("freshness") == "STALE")
        newest = None
        for v in vessels:
            try:
                ts = float(v.get("last_seen") or 0)
                newest = ts if newest is None or ts > newest else newest
            except (TypeError, ValueError):
                continue
        stats.update({"vessels_live": live, "vessels_stale": stale,
                      "newest_position": _iso(newest)})
        return stats

    def combined_status(self) -> str:
        a = _as.SERVICE.ais_status()
        o = _ow.SERVICE.provider_status()
        try:
            v = _va.SERVICE.provider_status()
        except Exception:
            v = "DISCONNECTED"
        states = (a, o, v)
        if "CONNECTED_LIVE" in states:
            return "CONNECTED_LIVE"
        if "AUTH_ERROR" in states and not any(s.startswith("CONNECTED") for s in states):
            return "AUTH_ERROR"
        if all(s == "DISCONNECTED" for s in states):
            return "DISCONNECTED"
        if all(s in ("DISCONNECTED", "NOT_CONFIGURED", "RATE_LIMITED") for s in states):
            return "RATE_LIMITED" if "RATE_LIMITED" in states else "DISCONNECTED"
        if "CONNECTED_WAITING" in states:
            return "CONNECTED_WAITING"
        if "SUBSCRIPTION_ERROR" in states or "STREAM_ERROR" in states:
            return "CONNECTED_WAITING" if "CONNECTED_WAITING" in states else "STREAM_ERROR"
        return "CONNECTED_NO_RECENT"

    def health(self) -> dict:
        as_h = _as.SERVICE.health()
        try:
            ow_h = _ow.SERVICE.health()
        except Exception as exc:
            ow_h = {"connected": False, "ais_status": "DISCONNECTED",
                    "error": f"{type(exc).__name__}", "vessels_tracked": 0}
        try:
            va_h = _va.SERVICE.health()
        except Exception as exc:
            va_h = {"connected": False, "configured": False, "ais_status": "NOT_CONFIGURED",
                    "error": f"{type(exc).__name__}", "vessels_tracked": 0}
        stats = self.aggregation_stats()
        now = time.time()
        vessels = self.snapshot()
        live = sum(1 for v in vessels if v.get("freshness") == "LIVE")
        diag_as = as_h.get("diagnostics", {})
        diag_ow = ow_h.get("diagnostics", {})
        diag_va = va_h.get("diagnostics", {})
        merged_diag = {
            "raw_messages": (diag_as.get("raw_messages") or 0) + (diag_ow.get("stream_messages") or 0),
            "position_report": diag_as.get("position_report"),
            "class_b_std": diag_as.get("class_b_std"),
            "class_b_ext": diag_as.get("class_b_ext"),
            "ship_static": diag_as.get("ship_static"),
            "openwaters_stream_positions": diag_ow.get("stream_positions"),
            "openwaters_poll_vessels": diag_ow.get("poll_vessels_seen"),
            "vesselapi_poll_vessels": diag_va.get("poll_vessels_seen"),
            "unknown_messages": diag_as.get("unknown_messages"),
            "parse_errors": (diag_as.get("parse_errors") or 0) + (diag_ow.get("parse_errors") or 0) + (diag_va.get("parse_errors") or 0),
            "reconnects": (diag_as.get("reconnects") or 0) + (diag_ow.get("stream_reconnects") or 0),
            "vessels_cached": stats["unique_vessels"],
            "status": self.combined_status(),
            "providers": {"aisstream": diag_as, "openwaters": diag_ow, "vesselapi": diag_va},
        }
        last_events = [e for e in (as_h.get("last_event"), ow_h.get("last_event")) if e]
        newest_ts = None
        for v in vessels:
            try:
                ts = float(v.get("last_seen") or 0)
                newest_ts = ts if newest_ts is None or ts > newest_ts else newest_ts
            except (TypeError, ValueError):
                continue
        return {
            "connected": bool(as_h.get("connected") or ow_h.get("connected") or va_h.get("connected")),
            "ais_status": self.combined_status(),
            "last_event": _iso(newest_ts),
            "last_event_age_s": round(now - newest_ts, 1) if newest_ts else None,
            "events_total": (as_h.get("events_total") or 0) + (ow_h.get("events_total") or 0) + (va_h.get("events_total") or 0),
            "events_per_min": as_h.get("events_per_min"),
            "vessels_tracked": stats["unique_vessels"],
            "vessels_live": live,
            "mode": "MULTI_SOURCE",
            "diagnostics": merged_diag,
            "sources": {"aisstream": as_h, "openwaters": ow_h, "vesselapi": va_h},
            "aggregation": stats,
        }


AGGREGATOR = MultiSourceAggregator()
