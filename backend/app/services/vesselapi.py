"""VesselAPI AIS provider: third independent first-class AIS source.

Transport: controlled REST polling of GET /v1/location/vessels/bounding-box
(Base URL https://api.vesselapi.com/v1). There is no true streaming endpoint
in the documented API, so this provider is honestly a RECENT API POLL source
— never presented as a live stream.

Quota discipline (monthly quota observed via X-RateLimit-Remaining):
- a handful of regional boxes, polled infrequently (defaults below);
- first result page only (pagination.limit 50), no nextToken walks;
- HTTP 429 / 403 / 503 honored with Retry-After + bounded backoff;
- monthly-quota exhaustion latches QUOTA_EXHAUSTED and stops polling
  (other providers are unaffected).

Auth: VESSELAPI_API_KEY from server env (never logged, never returned).
Missing key -> status NOT_CONFIGURED, worker idle, app unaffected.
"""
from __future__ import annotations

import os
import random
import threading
import time
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

import httpx

from app.services.ais_normalize import SOURCE_VESSELAPI, normalize_vesselapi_record

HTTP_BASE = "https://api.vesselapi.com/v1"

# Regional poll boxes as (name, latBottom, lonLeft, latTop, lonRight).
# Each satisfies the documented |dLat| + |dLon| <= 4 deg bbox limit.
# QUOTA DISCIPLINE: the monthly quota is small (observed ~150 remaining), so
# each cycle polls exactly ONE box (round-robin) and cycles are hours apart
# (see _poll_interval_s). A full 4-box sweep costs 4 quota, not 4 per cycle.
POLL_BOXES = [
    ("MUMBAI_APPR", 17.9, 71.9, 19.6, 73.6),
    ("KOCHI_APPR", 9.0, 75.4, 10.6, 76.8),
    ("CHENNAI_APPR", 12.4, 79.7, 14.0, 81.1),
    ("VIZAG_APPR", 17.0, 82.5, 18.4, 84.0),
]

QUOTA_FLOOR = 8

PAGE_LIMIT = 50
STALE_TTL_S = 900
MAX_TRACK_PTS = 30
USER_AGENT = "SAGARDRISHTI/1.0"


def _load_key() -> str:
    key = os.environ.get("VESSELAPI_API_KEY", "")
    if not key:
        root_env = Path(__file__).resolve().parents[3] / ".env"
        if root_env.exists():
            for line in root_env.read_text().splitlines():
                if line.startswith("VESSELAPI_API_KEY="):
                    key = line.split("=", 1)[1].strip().strip("'\"")
    return key


def _poll_interval_s() -> float:
    try:
        return max(300.0, float(os.environ.get("VESSELAPI_POLL_INTERVAL_S", "21600")))
    except (TypeError, ValueError):
        return 21600.0


class VesselApiService:
    """Independent REST-poll provider worker. start() is idempotent."""

    def __init__(self):
        self._lock = threading.Lock()
        self._vessels: dict[int, dict] = {}
        self._tracks: dict[int, list[dict]] = {}
        self._thread = None
        self._stop = threading.Event()
        self.configured = bool(_load_key())
        self.poll_runs = 0
        self.poll_vessels_seen = 0
        self.poll_errors = 0
        self.auth_failures = 0
        self.rate_limited = False
        self.quota_exhausted = False
        self.quota_remaining: int | None = None
        self.retry_after_until = 0.0
        self.parse_errors = 0
        self.invalid_records = 0
        self.glitch_filtered = 0
        self.india_region_messages = 0
        self.last_poll_ts: float | None = None
        self.last_poll_ok_ts: float | None = None
        self.last_position_ts: float | None = None
        self.last_error: str | None = None
        self.last_error_ts: float | None = None
        self._events: list[dict] = []

    # ---- lifecycle ----
    def start(self):
        with self._lock:
            if self._thread and self._thread.is_alive():
                return {"started": False, "reason": "already running"}
            self.configured = bool(_load_key())
            if not self.configured:
                return {"started": False, "reason": "NOT_CONFIGURED"}
            self._stop.clear()
            self._thread = threading.Thread(target=self._loop, daemon=True, name="vesselapi-poll")
            self._thread.start()
            return {"started": True}

    def stop(self):
        self._stop.set()

    @property
    def running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    def _log(self, kind: str, message: str) -> None:
        try:
            self._events.append({"ts": datetime.now(timezone.utc).isoformat(), "kind": kind, "message": message})
            del self._events[:-60]
        except Exception:
            pass

    def recent_events(self, limit: int = 25) -> list[dict]:
        with self._lock:
            return list(self._events[-max(1, min(int(limit), 60)):])[::-1]

    def _record_error(self, msg: str) -> None:
        self.last_error = str(msg)[:300]
        self.last_error_ts = time.time()

    # ---- poll loop ----
    def _loop(self):
        # Initial stagger so all three providers don't thunder at boot.
        time.sleep(20 + random.uniform(0, 20))
        box_idx = 0
        while not self._stop.is_set():
            try:
                if not self.quota_exhausted:
                    if self.quota_remaining is not None and self.quota_remaining < QUOTA_FLOOR:
                        # Too close to the floor: hold without spending quota.
                        self.rate_limited = True
                        self._record_error(f"poll: quota low ({self.quota_remaining} left) — holding")
                    else:
                        self._poll_box(box_idx % len(POLL_BOXES))
                        box_idx += 1
            except Exception as exc:
                self.poll_errors += 1
                self._record_error(f"poll loop: {type(exc).__name__}")
            interval = _poll_interval_s()
            for _ in range(int(interval)):
                if self._stop.is_set():
                    break
                time.sleep(1)

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {_load_key()}",
                "Accept": "application/json", "User-Agent": USER_AGENT}

    def _retry_wait_s(self, resp) -> float:
        try:
            return max(1.0, min(600.0, float(resp.headers.get("Retry-After", "5"))))
        except (TypeError, ValueError):
            return 5.0

    def _poll_box(self, idx: int):
        """Poll a single regional box (one quota unit per cycle)."""
        if time.time() < self.retry_after_until:
            return
        name, la0, lo0, la1, lo1 = POLL_BOXES[idx]
        self.poll_runs += 1
        self.last_poll_ts = time.time()
        now = time.time()
        q = urllib.parse.urlencode({
            "filter.latBottom": la0, "filter.lonLeft": lo0,
            "filter.latTop": la1, "filter.lonRight": lo1,
            "pagination.limit": PAGE_LIMIT})
        url = f"{HTTP_BASE}/location/vessels/bounding-box?{q}"
        try:
            resp = httpx.get(url, headers=self._headers(), timeout=30)
        except Exception as exc:
            self.poll_errors += 1
            self._record_error(f"poll {name}: {type(exc).__name__} (timeout/connection)")
            return
        rem = resp.headers.get("X-RateLimit-Remaining")
        try:
            self.quota_remaining = int(rem) if rem not in (None, "", "Unlimited") else None
        except (TypeError, ValueError):
            pass
        if resp.status_code in (401,):
            self.auth_failures += 1
            self._record_error(f"poll {name}: AUTHENTICATION_ERROR (401 invalid key)")
            self._log("error", "VesselAPI authentication failed — check server VESSELAPI_API_KEY")
            return
        if resp.status_code == 403:
            self.auth_failures += 1
            self._record_error(f"poll {name}: key suspended (403)")
            self.retry_after_until = time.time() + self._retry_wait_s(resp)
            return
        if resp.status_code == 429:
            self.rate_limited = True
            body = ""
            try:
                body = str(resp.json())
            except Exception:
                pass
            if "quota" in body.lower() or "monthly" in body.lower():
                self.quota_exhausted = True
                self._record_error("poll: monthly quota exhausted — polling halted")
                self._log("error", "VesselAPI monthly quota exhausted — polling halted, other sources unaffected")
            else:
                self._record_error("poll: concurrency rate limit (429)")
                self.retry_after_until = time.time() + self._retry_wait_s(resp)
            return
        if resp.status_code == 503:
            self._record_error(f"poll {name}: provider at capacity (503)")
            self.retry_after_until = time.time() + self._retry_wait_s(resp)
            return
        if resp.status_code != 200:
            self.poll_errors += 1
            self._record_error(f"poll {name}: HTTP {resp.status_code}")
            return
        try:
            items = resp.json().get("vessels") or []
        except Exception:
            self.parse_errors += 1
            return
        ok = 0
        for it in items:
            if isinstance(it, dict) and it.get("suspected_glitch") is True:
                self.glitch_filtered += 1
                continue
            rec = normalize_vesselapi_record(it, now)
            if rec is None:
                self.invalid_records += 1
                continue
            self._ingest(rec)
            ok += 1
        self.poll_vessels_seen += ok
        self.last_poll_ok_ts = time.time()

    def _poll_once(self):
        """Single-box poll used by tests and diagnostics (respects backoff)."""
        if not hasattr(self, "_diag_box_idx"):
            self._diag_box_idx = 0
        self._poll_box(self._diag_box_idx % len(POLL_BOXES))
        self._diag_box_idx += 1

    # ---- ingest ----
    def _ingest(self, rec: dict) -> None:
        mmsi = rec["mmsi"]
        is_new = mmsi not in self._vessels
        with self._lock:
            prev = self._vessels.get(mmsi)
            # A bbox page holds several fixes per vessel in no guaranteed
            # order — never let an older fix displace a newer position.
            if prev is not None:
                try:
                    if float(rec.get("last_seen") or 0) < float(prev.get("last_seen") or 0):
                        hist = self._tracks.get(mmsi, [])
                        hist.append({"lat": rec["latitude"], "lon": rec["longitude"], "ts": rec["last_seen"]})
                        if len(hist) > MAX_TRACK_PTS:
                            del hist[: len(hist) - MAX_TRACK_PTS]
                        self._tracks[mmsi] = hist
                        return
                except (TypeError, ValueError):
                    pass
            v = dict(prev) if prev is not None else {"mmsi": mmsi}
            v.update(rec)
            self._vessels[mmsi] = v
            hist = self._tracks.get(mmsi, [])
            hist.append({"lat": rec["latitude"], "lon": rec["longitude"], "ts": rec["last_seen"]})
            if len(hist) > MAX_TRACK_PTS:
                del hist[: len(hist) - MAX_TRACK_PTS]
            self._tracks[mmsi] = hist
        if self.last_position_ts is None or rec["last_seen"] > self.last_position_ts:
            if rec["last_seen"] <= time.time() + 300:
                self.last_position_ts = rec["last_seen"]
        try:
            from app.services.aisstream import point_in_boxes
            if point_in_boxes(rec["latitude"], rec["longitude"]):
                self.india_region_messages += 1
        except Exception:
            pass
        if is_new:
            self._log("vessel", f"VesselAPI position — MMSI {mmsi} now tracked")

    def _sweep(self) -> int:
        cutoff = time.time() - STALE_TTL_S
        evicted = 0
        with self._lock:
            dead = [m for m, v in self._vessels.items() if float(v.get("last_seen") or 0) < cutoff]
            for m in dead:
                del self._vessels[m]
                self._tracks.pop(m, None)
                evicted += 1
        return evicted

    def snapshot_records(self) -> list[dict]:
        self._sweep()
        with self._lock:
            vessels = list(self._vessels.values())
            tracks = {m: list(h) for m, h in self._tracks.items()}
        out = []
        for v in vessels:
            if v.get("latitude") is None or v.get("longitude") is None:
                continue
            hist = tracks.get(v["mmsi"], [])
            track = [{"lat": float(p["lat"]), "lon": float(p["lon"]), "ts": float(p["ts"])} for p in hist]
            out.append({**v, "track": track, "track_points": len(track)})
        return out

    # ---- status ----
    def provider_status(self) -> str:
        if not self.configured and not self.running:
            return "NOT_CONFIGURED"
        if self.auth_failures > 0 and self.poll_vessels_seen == 0:
            return "AUTH_ERROR"
        if self.quota_exhausted:
            return "RATE_LIMITED"
        if self.rate_limited and self.poll_vessels_seen == 0:
            return "RATE_LIMITED"
        if not self.running:
            return "DISCONNECTED"
        now = time.time()
        live = sum(1 for v in self._vessels.values()
                   if v.get("latitude") is not None and (now - float(v.get("last_seen") or 0)) < 180)
        if live > 0:
            return "CONNECTED_LIVE"
        if self.last_position_ts is not None and (now - self.last_position_ts) < 180:
            return "CONNECTED_LIVE"
        if self.poll_vessels_seen == 0:
            if self.last_poll_ok_ts is not None and (now - self.last_poll_ok_ts) < 300:
                return "CONNECTED_WAITING"
            return "CONNECTED_NO_RECENT"
        if self.last_position_ts is not None and (now - self.last_position_ts) >= 180:
            return "CONNECTED_NO_RECENT"
        return "CONNECTED_WAITING"

    def diagnostics(self) -> dict:
        now = time.time()

        def _iso(ts):
            return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat() if ts else None

        with self._lock:
            cached = len(self._vessels)
        return {
            "provider": SOURCE_VESSELAPI,
            "auth_mode": "key" if self.configured else "missing",
            "configured": bool(self.configured),
            "running": bool(self.running),
            "transport": "REST_POLL (no streaming endpoint in documented API)",
            "poll_runs": self.poll_runs,
            "poll_boxes": [{"name": b[0], "bbox": [b[1], b[2], b[3], b[4]]} for b in POLL_BOXES],
            "poll_interval_s": _poll_interval_s(),
            "page_limit": PAGE_LIMIT,
            "poll_vessels_seen": self.poll_vessels_seen,
            "poll_errors": self.poll_errors,
            "auth_failures": self.auth_failures,
            "rate_limited": bool(self.rate_limited),
            "quota_exhausted": bool(self.quota_exhausted),
            "quota_remaining": self.quota_remaining,
            "last_poll": _iso(self.last_poll_ts),
            "last_poll_ok": _iso(self.last_poll_ok_ts),
            "parse_errors": self.parse_errors,
            "invalid_records": self.invalid_records,
            "glitch_filtered": self.glitch_filtered,
            "india_region_messages": self.india_region_messages,
            "vessels_cached": cached,
            "last_position": _iso(self.last_position_ts),
            "last_position_age_s": round(now - self.last_position_ts, 1) if self.last_position_ts else None,
            "last_error": self.last_error,
            "last_error_ts": _iso(self.last_error_ts),
            "status": self.provider_status(),
        }

    def health(self) -> dict:
        now = time.time()
        diag = self.diagnostics()
        live = sum(1 for v in self._vessels.values()
                   if v.get("latitude") is not None and (now - float(v.get("last_seen") or 0)) < 60)
        return {
            "connected": bool(self.running),
            "configured": bool(self.configured),
            "last_event": _iso_or_none(self.last_position_ts),
            "last_event_age_s": round(now - self.last_position_ts, 1) if self.last_position_ts else None,
            "events_total": self.poll_vessels_seen,
            "events_per_min": None,
            "vessels_tracked": len(self._vessels),
            "vessels_live": live,
            "mode": "REST_POLL",
            "diagnostics": diag,
            "ais_status": diag["status"],
        }


def _iso_or_none(ts):
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat() if ts else None


SERVICE = VesselApiService()
VASERVICE = SERVICE
