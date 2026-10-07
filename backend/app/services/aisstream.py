"""AISStream server-side connector: WSS client, subscription, normalization, vessel state.

Key lives ONLY in server env (.env AISSTREAM_API_KEY). Never logged, never returned.
Event-driven consumption -> in-memory vessel state -> served via REST/SSE.

Hardened per SAGARDRISHTI AIS hardening task:
- handles PositionReport + StandardClassBPositionReport + ExtendedClassBPositionReport
- full end-to-end diagnostics (connection -> subscription -> messages -> parse -> cache)
- MMSI-keyed live cache with TTL eviction (LIVE_VESSEL_TTL_SECONDS = 900)
- observed-track history only (bounded, never synthesized)
- single worker, exponential backoff with jitter, no duplicate subscriptions
"""
from __future__ import annotations

import json
import math
import os
import random
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

import websocket  # websocket-client

# India maritime operating boxes as [minLat, minLon, maxLat, maxLon].
# AISStream expects [[[lat, lon], [lat, lon]], ...] (latitude FIRST). Converted on subscribe.
# Coverage: Arabian Sea + west-coast approaches, southern waters, Bay of Bengal + east coast.
BOUNDING_BOXES = [
    [0.0, 60.0, 28.0, 78.0],    # Arabian Sea + west coast approaches
    [-2.0, 76.0, 26.0, 100.0],  # southern waters + Bay of Bengal approaches
    [5.0, 78.0, 24.0, 96.0],    # Bay of Bengal + east coast approaches
]
MESSAGE_TYPES = ["PositionReport", "StandardClassBPositionReport",
                 "ExtendedClassBPositionReport", "ShipStaticData"]
# Position-bearing message types normalized into one vessel object.
POSITION_TYPES = ("PositionReport", "StandardClassBPositionReport",
                  "ExtendedClassBPositionReport")
STATIC_TYPES = ("ShipStaticData", "StaticDataReport")
PORT_RADIUS_KM = 50.0
# freshness thresholds (s), configurable
FRESH_LIVE_S = 60
FRESH_RECENT_S = 180
STALE_TTL_S = 900  # drop vessels unseen this long
LIVE_VESSEL_TTL_SECONDS = STALE_TTL_S
# Observed-track history: real AIS positions only, bounded per vessel (task: 20-50).
MAX_TRACK_PTS = 30
TRACK_MIN_MOVE_KM = 0.05  # ignore duplicate reports at identical fix
TRACK_MIN_GAP_S = 5.0
MAX_EVENTS = 60

_ws_url = "wss://stream.aisstream.io/v0/stream"

# Diagnostic-only broad boxes (never used by the production worker).
TEST_BOXES: dict[str, list[list[float]]] = {
    # AISStream global: full lat/lon range as one box.
    "WORLD": [[-90.0, -180.0, 90.0, 180.0]],
    "INDIAN_OCEAN": [[-35.0, 35.0, 32.0, 125.0]],
    "INDIA": [list(b) for b in BOUNDING_BOXES],
}


def _load_key() -> str:
    """Server-side key lookup: env first, then repo-root .env (CWD-independent). Never logged."""
    key = os.environ.get("AISSTREAM_API_KEY", "")
    if not key:
        root_env = Path(__file__).resolve().parents[3] / ".env"
        if root_env.exists():
            for line in root_env.read_text().splitlines():
                if line.startswith("AISSTREAM_API_KEY="):
                    key = line.split("=", 1)[1].strip().strip("'\"")
    return key


def build_subscription(key: str, boxes: list | None = None,
                        message_types: list | None = None) -> dict:
    """Official AISStream subscription payload. Caller must never log the key."""
    boxes = BOUNDING_BOXES if boxes is None else boxes
    message_types = MESSAGE_TYPES if message_types is None else message_types
    return {
        "APIKey": key,
        "BoundingBoxes": [[[b[0], b[1]], [b[2], b[3]]] for b in boxes],
        "FilterMessageTypes": list(message_types),
    }


def sanitized_subscription(boxes: list | None = None,
                           message_types: list | None = None) -> dict:
    """Subscription payload with the API key redacted — safe for logs / API responses."""
    sub = build_subscription("***REDACTED***", boxes, message_types)
    sub["APIKey"] = "***REDACTED***"
    return sub


def point_in_boxes(lat: float, lon: float, boxes: list | None = None) -> bool:
    boxes = BOUNDING_BOXES if boxes is None else boxes
    try:
        lat_f, lon_f = float(lat), float(lon)
    except (TypeError, ValueError):
        return False
    for b in boxes:
        try:
            if b[0] <= lat_f <= b[2] and b[1] <= lon_f <= b[3]:
                return True
        except (TypeError, IndexError):
            continue
    return False


def _haversine(lat1, lon1, lat2, lon2):
    r = math.radians
    a = math.sin(r((lat2 - lat1) / 2)) ** 2 + math.cos(r(lat1)) * math.cos(r(lat2)) * math.sin(r((lon2 - lon1) / 2)) ** 2
    return 2 * 6371.0 * math.asin(math.sqrt(max(0.0, min(1.0, a))))


def _bearing(lat1, lon1, lat2, lon2):
    r = math.radians
    dlon = r(lon2 - lon1)
    y = math.sin(dlon) * math.cos(r(lat2))
    x = math.cos(r(lat1)) * math.sin(r(lat2)) - math.sin(r(lat1)) * math.cos(r(lat2)) * math.cos(dlon)
    return (math.degrees(math.atan2(y, x)) + 360.0) % 360.0


def _valid_mmsi(mmsi) -> bool:
    try:
        m = int(mmsi)
    except (TypeError, ValueError):
        return False
    return 100000000 <= m <= 999999999


def _valid_pos(lat, lon) -> bool:
    try:
        return -90.0 <= float(lat) <= 90.0 and -180.0 <= float(lon) <= 180.0 and not (float(lat) == 91.0 or float(lon) == 181.0)
    except (TypeError, ValueError):
        return False


class AisStreamService:
    """Singleton WSS consumer. start() is idempotent; reconnect loop with backoff+jitter."""

    def __init__(self):
        self._lock = threading.Lock()
        self._vessels: dict[int, dict] = {}
        self._tracks: dict[int, list[dict]] = {}
        self._assoc_state: dict[int, str] = {}
        self._events: list[dict] = []
        self._ws = None
        self._thread = None
        self._stop = threading.Event()
        self.connected = False
        self.last_event_ts: float | None = None
        self.last_connected_ts: float | None = None
        self.error_count = 0
        self.events_total = 0
        self.events_1min: list[float] = []
        self._ports: list[dict] = []
        # ---- end-to-end diagnostics (never include the API key) ----
        self.connection_attempts = 0
        self.reconnects = 0
        self.subscription_sent_count = 0
        self.subscription_sent_ts: float | None = None
        self.subscription_confirmed = False
        self.subscription_error: str | None = None
        self.auth_error: str | None = None
        self.stream_error: str | None = None
        self.last_error: str | None = None
        self.last_error_ts: float | None = None
        self.last_close_ts: float | None = None
        self.compression_enabled = False  # websocket-client does not negotiate per-message-deflate
        self.compression_note = "DISABLED (websocket-client: per-message-deflate not negotiated)"
        self.raw_messages = 0
        self.msg_position_report = 0
        self.msg_class_b_std = 0
        self.msg_class_b_ext = 0
        self.msg_ship_static = 0
        self.msg_unknown = 0
        self.parse_errors = 0
        self.invalid_records = 0
        self.india_region_messages = 0
        self.outside_region_messages = 0
        self.last_message_ts: float | None = None
        self.last_position_ts: float | None = None
        self.last_static_ts: float | None = None
        self.first_message_ts: float | None = None
        self.active_boxes: list[list[float]] = [list(b) for b in BOUNDING_BOXES]

    def _log_event(self, kind: str, message: str) -> None:
        """Append a real backend event (connection, first-seen vessel, association
        transition). Bounded buffer; never synthesized beyond actual occurrences."""
        try:
            entry = {"ts": datetime.now(timezone.utc).isoformat(), "kind": kind, "message": message}
            self._events.append(entry)
            if len(self._events) > MAX_EVENTS:
                del self._events[: len(self._events) - MAX_EVENTS]
        except Exception:
            pass

    def recent_events(self, limit: int = 25) -> list[dict]:
        with self._lock:
            return list(self._events[-max(1, min(int(limit), MAX_EVENTS)):])[::-1]

    # ---- ports ----
    def ports(self):
        if not self._ports:
            import pandas as pd
            from pathlib import Path
            df = pd.read_parquet(Path(__file__).resolve().parents[3] / "data" / "reference" / "india_ports.parquet")
            self._ports = [{"port_id": int(r.port_id), "port_name": str(r.port_name),
                            "latitude": float(r.latitude), "longitude": float(r.longitude)} for r in df.itertuples()]
        return self._ports

    # ---- lifecycle ----
    def start(self):
        with self._lock:
            if self._thread and self._thread.is_alive():
                return {"started": False, "reason": "already running"}
            self._stop.clear()
            self._thread = threading.Thread(target=self._loop, daemon=True, name="aisstream")
            self._thread.start()
            return {"started": True}

    def stop(self):
        self._stop.set()
        try:
            if self._ws:
                self._ws.close()
        except Exception:
            pass

    def _loop(self):
        backoff = 5.0
        first = True
        while not self._stop.is_set():
            try:
                self._connect_once()
                backoff = 5.0  # reset after clean session end
            except Exception as exc:
                self.error_count += 1
                self._record_error(f"connect loop: {type(exc).__name__}")
            if not self._stop.is_set():
                if not first:
                    self.reconnects += 1
                first = False
                time.sleep(backoff + random.uniform(0, backoff * 0.5))
                backoff = min(backoff * 2, 300.0)

    def _record_error(self, msg: str) -> None:
        short = str(msg)[:300]
        self.last_error = short
        self.last_error_ts = time.time()
        low = short.lower()
        if "auth" in low or "api key" in low or "apikey" in low or "401" in low or "403" in low:
            self.auth_error = short
        elif "subscri" in low:
            self.subscription_error = short

    def _connect_once(self):
        key = _load_key()
        if not key:
            self._record_error("AISSTREAM_API_KEY missing (subscription not attempted)")
            self.subscription_error = "AISSTREAM_API_KEY missing"
            raise RuntimeError("AISSTREAM_API_KEY missing")
        self.connection_attempts += 1
        ws = websocket.WebSocketApp(
            _ws_url,
            on_open=self._on_open(key),
            on_message=self._on_message,
            on_error=self._on_error,
            on_close=self._on_close,
            header={"User-Agent": "SAGARDRISHTI/1.0"},
        )
        self._ws = ws
        ws.run_forever(ping_interval=30, ping_timeout=10)

    def _on_open(self, key):
        def _open(ws):
            self.connected = True
            self.last_connected_ts = time.time()
            self.stream_error = None
            self._log_event("connection", "AIS connection healthy — subscribed to India operating boxes")
            try:
                sub = build_subscription(key)
                ws.send(json.dumps(sub))
                self.subscription_sent_count += 1
                self.subscription_sent_ts = time.time()
                self.active_boxes = [list(b) for b in BOUNDING_BOXES]
            except Exception as exc:
                self._record_error(f"subscription send failed: {type(exc).__name__}")
                self.subscription_error = self.last_error
        return _open

    def _on_error(self, ws, error):
        self.error_count += 1
        self._record_error(f"websocket: {error}")
        self.stream_error = str(error)[:300]
        self._log_event("error", "AIS connection error — retrying with backoff")

    def _on_close(self, ws, status, msg):
        self.connected = False
        self.last_close_ts = time.time()
        self._log_event("connection", "AIS connection closed — reconnecting")

    # ---- ingest ----
    def _handle_position(self, mtype: str, msg: dict, meta: dict, now: float) -> None:
        """Normalize any position-bearing report into the single internal vessel object."""
        body = (msg.get("Message") or {}).get(mtype) or {}
        mmsi = meta.get("MMSI")
        lat, lon = meta.get("latitude"), meta.get("longitude")
        if not _valid_mmsi(mmsi) or not _valid_pos(lat, lon):
            self.invalid_records += 1
            return
        if point_in_boxes(lat, lon):
            self.india_region_messages += 1
        else:
            self.outside_region_messages += 1
        mmsi_i = int(mmsi)
        is_new = mmsi_i not in self._vessels or self._vessels[mmsi_i].get("latitude") is None
        self._upsert(mmsi_i, {
            "latitude": float(lat), "longitude": float(lon),
            "sog": body.get("Sog"), "cog": body.get("Cog"), "heading": body.get("Heading"),
            "nav_status": body.get("NavigationalStatus"),
            "timestamp": meta.get("time_utc") or datetime.fromtimestamp(now, tz=timezone.utc).isoformat(),
            "message_type": mtype,
            "received_at": datetime.fromtimestamp(now, tz=timezone.utc).isoformat(),
            "last_seen": now, "source": "AISSTREAM"})
        self._append_track(mmsi_i, float(lat), float(lon), now)
        self.last_position_ts = now
        if is_new:
            name = (self._vessels.get(mmsi_i, {}).get("ship_name") or "Unknown vessel")
            self._log_event("vessel", f"AIS position received — MMSI {mmsi_i} ({name}) now tracked")

    def _on_message(self, ws, raw):
        now = time.time()
        try:
            if isinstance(raw, bytes):
                raw = raw.decode("utf-8", errors="replace")
            msg = json.loads(raw)
        except Exception:
            self.error_count += 1
            self.parse_errors += 1
            self._record_error("message parse failed (non-JSON frame)")
            return
        self.raw_messages += 1
        self.last_message_ts = now
        if self.first_message_ts is None:
            self.first_message_ts = now
        try:
            mtype = msg.get("MessageType")
            meta = msg.get("MetaData", {}) or {}
            # AISStream error frames surface auth/subscription problems explicitly.
            if mtype in (None, "", "Error", "AuthError", "SubscriptionError"):
                detail = str(msg.get("ErrorMessage") or msg.get("error") or msg)[:300]
                self.msg_unknown += 1
                self._record_error(f"aisstream frame: {detail}")
                if "apikey" in detail.lower() or "api key" in detail.lower() or "auth" in detail.lower():
                    self.auth_error = detail
                    self._log_event("error", "AISStream authentication error — check server AISSTREAM_API_KEY")
                else:
                    self.subscription_error = detail
                return
            if mtype == "SubscriptionConfirmation":
                # Protocol-level ACK (contains e.g. {"CompressionEnabled": false}).
                # Counts as subscription acceptance, not vessel data.
                self.subscription_confirmed = True
                try:
                    comp = (msg.get("Message") or {}).get("CompressionEnabled")
                    if comp:
                        self.compression_enabled = True
                        self.compression_note = "ENABLED (negotiated per AISStream confirmation)"
                except Exception:
                    pass
                self._log_event("connection", "AISStream subscription confirmed by server")
                return
            if mtype in POSITION_TYPES:
                if mtype == "PositionReport":
                    self.msg_position_report += 1
                elif mtype == "StandardClassBPositionReport":
                    self.msg_class_b_std += 1
                else:
                    self.msg_class_b_ext += 1
                self._handle_position(mtype, msg, meta, now)
            elif mtype in STATIC_TYPES:
                self.msg_ship_static += 1
                sd = (msg.get("Message") or {}).get(mtype) or {}
                mmsi = meta.get("MMSI") or sd.get("Mmsi")
                if not _valid_mmsi(mmsi):
                    self.invalid_records += 1
                    return
                self._upsert(int(mmsi), {
                    "ship_name": (sd.get("ShipName") or "").strip() or None,
                    "destination": (sd.get("Destination") or "").strip() or None,
                    "ship_type": sd.get("ShipType"), "imo": sd.get("ImoNumber"),
                    "message_type": mtype,
                    "received_at": datetime.fromtimestamp(now, tz=timezone.utc).isoformat(),
                    "last_seen_static": now, "source": "AISSTREAM"})
                self.last_static_ts = now
            else:
                self.msg_unknown += 1
                return
            self.last_event_ts = now
            self.events_total += 1
            self.events_1min.append(now)
        except Exception as exc:
            self.error_count += 1
            self.parse_errors += 1
            self._record_error(f"message handling: {type(exc).__name__}")

    def _upsert(self, mmsi: int, fields: dict):
        with self._lock:
            v = self._vessels.get(mmsi, {"mmsi": mmsi})
            v.update({k: val for k, val in fields.items() if val is not None or k in ("ship_name", "destination")})
            self._vessels[mmsi] = v

    def _append_track(self, mmsi: int, lat: float, lon: float, ts: float) -> None:
        """Record one real observed fix. Bounded, de-duplicated, never synthesized."""
        with self._lock:
            hist = self._tracks.get(mmsi, [])
            if hist:
                last = hist[-1]
                dt = ts - last.get("ts", 0)
                try:
                    moved = _haversine(last["lat"], last["lon"], lat, lon)
                except Exception:
                    moved = float("inf")
                if moved < TRACK_MIN_MOVE_KM and dt < TRACK_MIN_GAP_S:
                    return
            hist.append({"lat": lat, "lon": lon, "ts": ts})
            if len(hist) > MAX_TRACK_PTS:
                del hist[: len(hist) - MAX_TRACK_PTS]
            self._tracks[mmsi] = hist

    # ---- reads ----
    def _sweep(self) -> int:
        """Evict vessels unseen beyond LIVE_VESSEL_TTL_SECONDS. Returns evicted count."""
        cutoff = time.time() - STALE_TTL_S
        evicted = 0
        with self._lock:
            dead = [m for m, v in self._vessels.items()
                    if max(float(v.get("last_seen") or 0), float(v.get("last_seen_static") or 0)) < cutoff]
            for m in dead:
                del self._vessels[m]
                self._tracks.pop(m, None)
                self._assoc_state.pop(m, None)
                evicted += 1
        return evicted

    def snapshot(self, max_age_s: float | None = None) -> list[dict]:
        self._sweep()
        now = time.time()
        self.events_1min = [t for t in self.events_1min if now - t < 60]
        out = []
        with self._lock:
            vessels = list(self._vessels.values())
            tracks = {m: list(h) for m, h in self._tracks.items()}
        ports = self.ports()
        for v in vessels:
            lat, lon = v.get("latitude"), v.get("longitude")
            if lat is None or lon is None:
                continue
            age = now - v.get("last_seen", now)
            if max_age_s is not None and age > max_age_s:
                continue
            state = "LIVE" if age < FRESH_LIVE_S else ("RECENT" if age < FRESH_RECENT_S else "STALE")
            best, best_d = None, float("inf")
            for p in ports:
                d = _haversine(lat, lon, p["latitude"], p["longitude"])
                if d < best_d:
                    best, best_d = p, d
            assoc = self._associate(v, best, best_d)
            prev = self._assoc_state.get(v["mmsi"])
            if prev is not None and prev != assoc and assoc in ("APPROACHING", "WITHIN PORT RADIUS", "DEPARTING"):
                pname = best["port_name"] if best is not None and best_d <= PORT_RADIUS_KM * 3 else (best["port_name"] if best else "unknown port")
                self._log_event("association", f"MMSI {v['mmsi']} {assoc.lower()} — {pname} association radius")
            self._assoc_state[v["mmsi"]] = assoc
            hist = tracks.get(v["mmsi"], [])
            # Observed AIS track: prior real fixes only (exclude current fix to avoid duplication).
            track = [{"lat": float(pt["lat"]), "lon": float(pt["lon"]), "ts": float(pt["ts"])}
                     for pt in hist if pt.get("ts", 0) <= v.get("last_seen", now)]
            if track and abs(track[-1]["lat"] - lat) < 1e-9 and abs(track[-1]["lon"] - lon) < 1e-9:
                observed = track[:-1]
            else:
                observed = track
            out.append({"mmsi": v["mmsi"], "ship_name": v.get("ship_name"), "latitude": lat, "longitude": lon,
                        "sog": v.get("sog"), "cog": v.get("cog"), "heading": v.get("heading"),
                        "nav_status": v.get("nav_status"), "timestamp": v.get("timestamp"),
                        "message_type": v.get("message_type"),
                        "received_at": v.get("received_at"),
                        "last_seen": v.get("last_seen"), "data_age_seconds": round(age, 1),
                        "freshness": state, "source": "AISSTREAM",
                        "associated_port_id": best["port_id"] if best_d <= PORT_RADIUS_KM else None,
                        "associated_port_name": best["port_name"] if best_d <= PORT_RADIUS_KM else None,
                        "distance_to_port_km": round(best_d, 2), "nearest_port_id": best["port_id"] if best else None,
                        "nearest_port_name": best["port_name"] if best else None,
                        "vessel_status": assoc,
                        "ais_destination": v.get("destination"),
                        "track": observed[-(MAX_TRACK_PTS - 1):],
                        "track_points": len(observed)})
        return out

    @staticmethod
    def _associate(v, port, dist) -> str:
        if port is None:
            return "UNKNOWN"
        cog, sog = v.get("cog"), v.get("sog")
        if dist <= PORT_RADIUS_KM:
            base = "WITHIN PORT RADIUS"
        elif dist <= PORT_RADIUS_KM * 3:
            base = "NEAR PORT"
        else:
            return "OFFSHORE"
        try:
            cog_f, sog_f = float(cog), float(sog)
        except (TypeError, ValueError):
            return base
        if not (0.0 <= cog_f <= 360.0) or sog_f < 0.5:
            return base
        brg = _bearing(v["latitude"], v["longitude"], port["latitude"], port["longitude"])
        diff = abs((cog_f - brg + 180.0) % 360.0 - 180.0)
        if diff <= 30.0:
            return "APPROACHING"
        if diff >= 150.0:
            return "DEPARTING"
        return base

    def ais_status(self) -> str:
        """Precise stream state: connection success is distinct from data availability."""
        if self.auth_error:
            return "AUTH_ERROR"
        if self.subscription_error:
            return "SUBSCRIPTION_ERROR"
        if not self.connected or not (self._thread is not None and self._thread.is_alive()):
            return "DISCONNECTED"
        if self.stream_error and self.raw_messages == 0:
            return "STREAM_ERROR"
        now = time.time()
        live = sum(1 for v in self._vessels.values()
                   if v.get("latitude") is not None
                   and (now - float(v.get("last_seen") or 0)) < FRESH_RECENT_S)
        if live > 0:
            return "CONNECTED_LIVE"
        if self.last_position_ts is not None and (now - self.last_position_ts) < FRESH_RECENT_S:
            return "CONNECTED_LIVE"
        if self.raw_messages == 0:
            if self.last_connected_ts is not None and (now - self.last_connected_ts) < 120:
                return "CONNECTED_WAITING"
            return "CONNECTED_NO_RECENT"
        if self.last_position_ts is not None and (now - self.last_position_ts) >= FRESH_RECENT_S:
            return "CONNECTED_NO_RECENT"
        if self.last_message_ts is not None and (now - self.last_message_ts) >= FRESH_RECENT_S:
            return "CONNECTED_NO_RECENT"
        return "CONNECTED_WAITING"

    def diagnostics(self) -> dict:
        now = time.time()
        with self._lock:
            cached = len(self._vessels)
        def _iso(ts):
            return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat() if ts else None
        return {
            "websocket_attempted": self.connection_attempts > 0,
            "websocket_connected": bool(self.connected),
            "connection_attempts": self.connection_attempts,
            "reconnects": self.reconnects,
            "subscription_sent": self.subscription_sent_count > 0,
            "subscription_sent_count": self.subscription_sent_count,
            "subscription_sent_ts": _iso(self.subscription_sent_ts),
            "subscription_payload": sanitized_subscription(self.active_boxes, MESSAGE_TYPES),
            "subscription_ack": bool(self.subscription_confirmed or self.raw_messages > 0),
            "subscription_error": self.subscription_error,
            "auth_error": self.auth_error,
            "stream_error": self.stream_error,
            "compression": "DISABLED",
            "compression_note": self.compression_note,
            "raw_messages": self.raw_messages,
            "position_report": self.msg_position_report,
            "class_b_std": self.msg_class_b_std,
            "class_b_ext": self.msg_class_b_ext,
            "ship_static": self.msg_ship_static,
            "unknown_messages": self.msg_unknown,
            "parse_errors": self.parse_errors,
            "invalid_records": self.invalid_records,
            "india_region_messages": self.india_region_messages,
            "outside_region_messages": self.outside_region_messages,
            "vessels_cached": cached,
            "last_message": _iso(self.last_message_ts),
            "last_message_age_s": round(now - self.last_message_ts, 1) if self.last_message_ts else None,
            "last_position": _iso(self.last_position_ts),
            "last_position_age_s": round(now - self.last_position_ts, 1) if self.last_position_ts else None,
            "last_static": _iso(self.last_static_ts),
            "last_connected": _iso(self.last_connected_ts),
            "last_close": _iso(self.last_close_ts),
            "last_error": self.last_error,
            "last_error_ts": _iso(self.last_error_ts),
            "bounding_boxes": [list(b) for b in self.active_boxes],
            "message_types": list(MESSAGE_TYPES),
            "api_key_present": bool(_load_key()),
            "status": self.ais_status(),
        }

    def health(self) -> dict:
        now = time.time()
        diag = self.diagnostics()
        base = {"connected": self.connected and self._thread is not None and self._thread.is_alive(),
                "last_event": datetime.fromtimestamp(self.last_event_ts, tz=timezone.utc).isoformat() if self.last_event_ts else None,
                "last_event_age_s": round(now - self.last_event_ts, 1) if self.last_event_ts else None,
                "last_connected": datetime.fromtimestamp(self.last_connected_ts, tz=timezone.utc).isoformat() if self.last_connected_ts else None,
                "error_count": self.error_count, "events_total": self.events_total,
                "events_per_min": len([t for t in self.events_1min if now - t < 60]),
                "vessels_tracked": len(self._vessels),
                "bounding_boxes": BOUNDING_BOXES, "message_types": MESSAGE_TYPES, "mode": "EVENT_DRIVEN"}
        base["diagnostics"] = diag
        base["ais_status"] = diag["status"]
        return base


SERVICE = AisStreamService()
