"""Open Waters AIS provider: independent first-class AIS source for SAGARDRISHTI.

Transports (both belong to the SAME source, neither is a fallback):
- stream: wss://ais.openwaters.io/v1/stream with bbox subscription
          (anonymous area budget ~100 sq deg; boxes below total ~90).
- poll:   GET https://ais.openwaters.io/v1/vessels (regional port boxes).

Anonymous access works with no key. If OPENWATERS_API_KEY is set in the
server environment it is sent as a Bearer token (never logged, never
returned by any API). No provider token ever reaches the frontend.
"""
from __future__ import annotations

import json
import os
import random
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx
import websocket  # websocket-client

from app.services.ais_normalize import (
    SOURCE_OPENWATERS,
    normalize_openwaters_event,
    normalize_openwaters_feature,
    valid_position,
)

HTTP_BASE = "https://ais.openwaters.io/v1"
WS_URL = "wss://ais.openwaters.io/v1/stream"

# Stream boxes as [minLat, minLon, maxLat, maxLon]. Total area ~90 sq deg,
# inside the anonymous ~100 sq deg budget. West-coast strip + Chennai strip.
STREAM_BOXES = [
    [8.0, 71.0, 21.0, 77.5],    # Arabian Sea / west-coast approaches
    [12.0, 79.5, 14.5, 81.5],   # Chennai approaches
]

# HTTP poll boxes as [name, minLat, minLon, maxLat, maxLon, limit].
POLL_BOXES = [
    ("MUMBAI", 17.8, 71.8, 19.8, 73.8, 300),
    ("KOCHI", 9.0, 75.3, 11.0, 77.0, 200),
    ("CHENNAI", 12.0, 79.5, 14.5, 81.5, 200),
    ("VIZAG", 17.2, 82.8, 18.2, 83.8, 200),
    ("PARADIP_KOLKATA", 19.5, 85.8, 22.2, 88.5, 200),
]

POLL_INTERVAL_S = 120
STALE_TTL_S = 900
MAX_TRACK_PTS = 30
USER_AGENT = "SAGARDRISHTI/1.0"


def _load_token() -> str:
    """Optional token: env first, then repo-root .env. Empty = anonymous."""
    tok = os.environ.get("OPENWATERS_API_KEY", "")
    if not tok:
        root_env = Path(__file__).resolve().parents[3] / ".env"
        if root_env.exists():
            for line in root_env.read_text().splitlines():
                if line.startswith("OPENWATERS_API_KEY="):
                    tok = line.split("=", 1)[1].strip().strip("'\"")
    return tok


class OpenWatersService:
    """Independent provider worker. start() is idempotent (stream + poll threads)."""

    def __init__(self):
        self._lock = threading.Lock()
        self._vessels: dict[int, dict] = {}
        self._tracks: dict[int, list[dict]] = {}
        self._threads: list[threading.Thread] = []
        self._stop = threading.Event()
        self._ws = None
        # stream diagnostics
        self.stream_attempts = 0
        self.stream_reconnects = 0
        self.stream_connected = False
        self.stream_confirmed = False
        self.stream_messages = 0
        self.stream_positions = 0
        self.last_stream_ts: float | None = None
        self.last_stream_conn_ts: float | None = None
        # poll diagnostics
        self.poll_runs = 0
        self.poll_vessels_seen = 0
        self.poll_errors = 0
        self.rate_limited = False
        self.last_poll_ts: float | None = None
        self.last_poll_ok_ts: float | None = None
        # shared
        self.parse_errors = 0
        self.invalid_records = 0
        self.india_region_messages = 0
        self.last_position_ts: float | None = None
        self.last_error: str | None = None
        self.last_error_ts: float | None = None
        self._events: list[dict] = []

    # ---- lifecycle ----
    def start(self):
        with self._lock:
            live = [t for t in self._threads if t.is_alive()]
            if live:
                return {"started": False, "reason": "already running"}
            self._stop.clear()
            self._threads = [
                threading.Thread(target=self._stream_loop, daemon=True, name="openwaters-stream"),
                threading.Thread(target=self._poll_loop, daemon=True, name="openwaters-poll"),
            ]
            for t in self._threads:
                t.start()
            return {"started": True}

    def stop(self):
        self._stop.set()
        try:
            if self._ws:
                self._ws.close()
        except Exception:
            pass

    @property
    def running(self) -> bool:
        return any(t.is_alive() for t in self._threads)

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

    # ---- stream transport ----
    def _stream_loop(self):
        backoff = 5.0
        first = True
        while not self._stop.is_set():
            try:
                self._stream_once()
                backoff = 5.0
            except Exception as exc:
                self._record_error(f"stream: {type(exc).__name__}: {str(exc)[:120]}")
            if not self._stop.is_set():
                if not first:
                    self.stream_reconnects += 1
                first = False
                time.sleep(backoff + random.uniform(0, backoff * 0.5))
                backoff = min(backoff * 2, 300.0)

    def _stream_once(self):
        self.stream_attempts += 1
        token = _load_token()
        headers = {"User-Agent": "SAGARDRISHTI/1.0"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        ws = websocket.WebSocketApp(
            WS_URL,
            on_open=self._on_stream_open,
            on_message=self._on_stream_message,
            on_error=self._on_stream_error,
            on_close=self._on_stream_close,
            header=headers,
        )
        self._ws = ws
        ws.run_forever(ping_interval=20, ping_timeout=10)

    def _on_stream_open(self, ws):
        self.stream_connected = True
        self.last_stream_conn_ts = time.time()
        self._log("connection", "Open Waters stream connected — subscribing India boxes")
        try:
            ws.send(json.dumps({
                "type": "subscribe",
                "bbox": [[b[0], b[1], b[2], b[3]] for b in STREAM_BOXES],
            }))
        except Exception as exc:
            self._record_error(f"stream subscribe failed: {type(exc).__name__}")

    def _on_stream_error(self, ws, error):
        self._record_error(f"stream socket: {str(error)[:150]}")
        self._log("error", "Open Waters stream error — retrying with backoff")

    def _on_stream_close(self, ws, status, msg):
        self.stream_connected = False
        self._log("connection", "Open Waters stream closed — reconnecting")

    def _on_stream_message(self, ws, raw):
        now = time.time()
        try:
            if isinstance(raw, bytes):
                raw = raw.decode("utf-8", errors="replace")
            frame = json.loads(raw)
        except Exception:
            self.parse_errors += 1
            return
        ftype = frame.get("type")
        if ftype in ("welcome", "ack", "subscribed", "pong"):
            self.stream_confirmed = True
            return
        if ftype == "error":
            self._record_error(f"stream server: {str(frame.get('message') or frame.get('error') or frame)[:150]}")
            if "rate" in str(frame).lower() or "limit" in str(frame).lower():
                self.rate_limited = True
            return
        if ftype != "event":
            return
        self.stream_messages += 1
        self.last_stream_ts = now
        rec = normalize_openwaters_event(frame, now)
        if rec is None:
            self.invalid_records += 1
            return
        self.stream_positions += 1
        self._ingest(rec, now)

    # ---- poll transport ----
    def _poll_loop(self):
        while not self._stop.is_set():
            try:
                self._poll_once()
            except Exception as exc:
                self.poll_errors += 1
                self._record_error(f"poll: {type(exc).__name__}: {str(exc)[:120]}")
            for _ in range(int(POLL_INTERVAL_S)):
                if self._stop.is_set():
                    break
                time.sleep(1)

    def _poll_once(self):
        token = _load_token()
        headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        now = time.time()
        self.poll_runs += 1
        self.last_poll_ts = now
        for name, la0, lo0, la1, lo1, limit in POLL_BOXES:
            if self._stop.is_set():
                break
            url = f"{HTTP_BASE}/vessels?bbox={la0},{lo0},{la1},{lo1}&limit={limit}"
            try:
                resp = httpx.get(url, headers=headers, timeout=30)
            except Exception as exc:
                self.poll_errors += 1
                self._record_error(f"poll {name}: {type(exc).__name__}")
                continue
            if resp.status_code == 429:
                self.rate_limited = True
                self.poll_errors += 1
                self._record_error(f"poll {name}: RATE_LIMITED (429)")
                continue
            if resp.status_code != 200:
                self.poll_errors += 1
                self._record_error(f"poll {name}: HTTP {resp.status_code}")
                continue
            try:
                data = resp.json()
            except Exception:
                self.parse_errors += 1
                continue
            feats = data.get("features") or []
            ok = 0
            for f in feats:
                rec = normalize_openwaters_feature(f, now)
                if rec is None:
                    self.invalid_records += 1
                    continue
                self._ingest(rec, now)
                ok += 1
            self.poll_vessels_seen += ok
            self.last_poll_ok_ts = time.time()
            time.sleep(2)  # gentle pacing between boxes

    # ---- ingest ----
    def _ingest(self, rec: dict, now: float) -> None:
        mmsi = rec["mmsi"]
        is_new = mmsi not in self._vessels
        with self._lock:
            v = self._vessels.get(mmsi, {"mmsi": mmsi})
            v.update(rec)
            self._vessels[mmsi] = v
            hist = self._tracks.get(mmsi, [])
            hist.append({"lat": rec["latitude"], "lon": rec["longitude"], "ts": rec["last_seen"]})
            if len(hist) > MAX_TRACK_PTS:
                del hist[: len(hist) - MAX_TRACK_PTS]
            self._tracks[mmsi] = hist
        self.last_position_ts = now if (self.last_position_ts is None or now > self.last_position_ts) else self.last_position_ts
        # India-region accounting against the shared India operating boxes.
        try:
            from app.services.aisstream import point_in_boxes
            if point_in_boxes(rec["latitude"], rec["longitude"]):
                self.india_region_messages += 1
        except Exception:
            pass
        if is_new:
            self._log("vessel", f"Open Waters position — MMSI {mmsi} now tracked")

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
        """Normalized per-MMSI records (no port association; aggregator owns that)."""
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
        if self.rate_limited and self.stream_messages == 0 and self.poll_vessels_seen == 0:
            return "RATE_LIMITED"
        if not self.stream_connected and not self.running:
            return "DISCONNECTED"
        now = time.time()
        live = sum(1 for v in self._vessels.values()
                   if v.get("latitude") is not None and (now - float(v.get("last_seen") or 0)) < 180)
        if live > 0:
            return "CONNECTED_LIVE"
        if self.last_position_ts is not None and (now - self.last_position_ts) < 180:
            return "CONNECTED_LIVE"
        if self.stream_messages == 0 and self.poll_vessels_seen == 0:
            if self.last_stream_conn_ts is not None and (now - self.last_stream_conn_ts) < 120:
                return "CONNECTED_WAITING"
            if self.last_poll_ok_ts is not None and (now - self.last_poll_ok_ts) < POLL_INTERVAL_S + 60:
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
            "provider": SOURCE_OPENWATERS,
            # Always configured: anonymous access works with no key; a free
            # personal token (api_key_present) only raises limits.
            "configured": True,
            "auth_mode": "token" if _load_token() else "anonymous",
            "api_key_present": bool(_load_token()),
            "stream_attempted": self.stream_attempts > 0,
            "stream_connected": bool(self.stream_connected),
            "stream_attempts": self.stream_attempts,
            "stream_reconnects": self.stream_reconnects,
            "subscription_sent": self.stream_attempts > 0,
            "subscription_ack": bool(self.stream_confirmed),
            "stream_boxes": [list(b) for b in STREAM_BOXES],
            "stream_messages": self.stream_messages,
            "stream_positions": self.stream_positions,
            "last_stream_message": _iso(self.last_stream_ts),
            "last_stream_message_age_s": round(now - self.last_stream_ts, 1) if self.last_stream_ts else None,
            "last_stream_connected": _iso(self.last_stream_conn_ts),
            "poll_runs": self.poll_runs,
            "poll_boxes": [{"name": b[0], "bbox": [b[1], b[2], b[3], b[4]], "limit": b[5]} for b in POLL_BOXES],
            "poll_interval_s": POLL_INTERVAL_S,
            "poll_vessels_seen": self.poll_vessels_seen,
            "poll_errors": self.poll_errors,
            "last_poll": _iso(self.last_poll_ts),
            "last_poll_ok": _iso(self.last_poll_ok_ts),
            "rate_limited": bool(self.rate_limited),
            "parse_errors": self.parse_errors,
            "invalid_records": self.invalid_records,
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
            "connected": bool(self.stream_connected) or self.running,
            "last_event": _iso_or_none(self.last_position_ts),
            "last_event_age_s": round(now - self.last_position_ts, 1) if self.last_position_ts else None,
            "events_total": self.stream_positions + self.poll_vessels_seen,
            "events_per_min": None,
            "vessels_tracked": len(self._vessels),
            "vessels_live": live,
            "mode": "STREAM_PLUS_POLL",
            "diagnostics": diag,
            "ais_status": diag["status"],
        }


def _iso_or_none(ts):
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat() if ts else None


SERVICE = OpenWatersService()
OWSERVICE = SERVICE
