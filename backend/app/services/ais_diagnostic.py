"""Raw AISStream diagnostic probe (no mocks, no fabricated vessels).

Usage (from repo root):
    py -m app.services.ais_diagnostic              # 65s on production India boxes
    py -m app.services.ais_diagnostic --seconds 75 --mode world
    py -m app.services.ais_diagnostic --mode indian-ocean --seconds 65

Modes:
    india         production SAGARDRISHTI boxes (default)
    indian-ocean  broad Indian-Ocean box (diagnosis step 2)
    world         global box  (diagnosis step 1 — verifies key/parse path)

The API key is read server-side only and never printed.
"""
from __future__ import annotations

import argparse
import json
import sys
import threading
import time
from datetime import datetime, timezone

sys.path.insert(0, ".")
sys.path.insert(0, "backend")


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Raw AISStream diagnostic probe")
    p.add_argument("--seconds", type=int, default=65,
                   help="listen window in seconds (>=60 recommended)")
    p.add_argument("--mode", default="india",
                   choices=["india", "indian-ocean", "world"],
                   help="which bounding boxes to subscribe with")
    p.add_argument("--verbose-every", type=int, default=1,
                   help="print every Nth position report in full (default 1 = all)")
    return p.parse_args()


def main() -> int:
    args = _parse_args()
    seconds = max(5, int(args.seconds))

    from app.services.aisstream import (
        MESSAGE_TYPES, TEST_BOXES, _load_key, build_subscription, point_in_boxes,
    )
    import websocket

    key = _load_key()
    if not key:
        print("AISSTREAM DIAGNOSTIC")
        print("--------------------")
        print("WebSocket: NOT ATTEMPTED")
        print("Subscription: NOT SENT (AISSTREAM_API_KEY missing)")
        print("STATUS: AUTHENTICATION ERROR — server key missing")
        return 2

    boxes = TEST_BOXES["INDIA"] if args.mode == "india" else (
        TEST_BOXES["INDIAN_OCEAN"] if args.mode == "indian-ocean" else TEST_BOXES["WORLD"])
    sub = build_subscription(key, boxes, MESSAGE_TYPES)

    counts: dict[str, int] = {}
    mmsis: set[int] = set()
    india_msgs = 0
    latest: dict | None = None
    lock = threading.Lock()
    connected = threading.Event()
    sub_sent = threading.Event()
    first_ts: float | None = None
    last_ts: float | None = None
    errors: list[str] = []
    done = threading.Event()

    def on_open(ws):
        connected.set()
        try:
            ws.send(json.dumps(sub))
            sub_sent.set()
        except Exception as exc:  # pragma: no cover
            errors.append(f"subscription send failed: {type(exc).__name__}")

    def on_message(ws, raw):
        nonlocal latest, first_ts, last_ts, india_msgs
        try:
            if isinstance(raw, bytes):
                raw = raw.decode("utf-8", errors="replace")
            msg = json.loads(raw)
        except Exception:
            with lock:
                counts["_parse_error"] = counts.get("_parse_error", 0) + 1
            return
        mtype = str(msg.get("MessageType") or "UNKNOWN")
        meta = msg.get("MetaData") or {}
        now = time.time()
        with lock:
            counts[mtype] = counts.get(mtype, 0) + 1
            if first_ts is None:
                first_ts = now
            last_ts = now
        if mtype == "SubscriptionConfirmation":
            comp = (msg.get("Message") or {})
            print(f"[SubscriptionConfirmation] compression={comp.get('CompressionEnabled')}")
            with lock:
                counts[mtype] = counts.get(mtype, 0) + 1
            return
        if mtype in ("PositionReport", "StandardClassBPositionReport",
                     "ExtendedClassBPositionReport"):
            body = (msg.get("Message") or {}).get(mtype) or {}
            try:
                mmsi = int(meta.get("MMSI"))
            except (TypeError, ValueError):
                return
            lat, lon = meta.get("latitude"), meta.get("longitude")
            sog, cog = body.get("Sog"), body.get("Cog")
            ts = meta.get("time_utc")
            try:
                inside = point_in_boxes(lat, lon)
            except Exception:
                inside = False
            with lock:
                mmsis.add(mmsi)
                if inside:
                    india_msgs += 1
                latest = {"mmsi": mmsi, "lat": lat, "lon": lon, "sog": sog,
                          "cog": cog, "ts": ts, "type": mtype}
            n = counts[mtype]
            if n % max(1, args.verbose_every) == 0:
                print(f"[{mtype}] MMSI={mmsi} lat={lat} lon={lon} "
                      f"SOG={sog} COG={cog} ts={ts} india={inside}")
        elif mtype in ("ShipStaticData", "StaticDataReport"):
            sd = (msg.get("Message") or {}).get(mtype) or {}
            name = (sd.get("ShipName") or "").strip()
            print(f"[{mtype}] MMSI={meta.get('MMSI')} name={name or '—'}")
        else:
            print(f"[{mtype}] {str(raw)[:160]}")

    def on_error(ws, error):
        errors.append(str(error)[:200])

    print("AISSTREAM DIAGNOSTIC")
    print("--------------------")
    print(f"Mode: {args.mode}  window: {seconds}s")
    print(f"Endpoint: wss://stream.aisstream.io/v0/stream")
    print(f"Boxes: {json.dumps(sub['BoundingBoxes'])}")
    print(f"FilterMessageTypes: {','.join(sub['FilterMessageTypes'])}")
    print("(API key present, redacted) — connecting…")

    ws = websocket.WebSocketApp(
        "wss://stream.aisstream.io/v0/stream",
        on_open=on_open, on_message=on_message, on_error=on_error,
        header={"User-Agent": "SAGARDRISHTI-diagnostic/1.0"},
    )
    thread = threading.Thread(target=lambda: ws.run_forever(ping_interval=30, ping_timeout=10),
                              daemon=True)
    thread.start()
    deadline = time.time() + seconds
    while time.time() < deadline and not done.is_set():
        time.sleep(1.0)
    try:
        ws.close()
    except Exception:
        pass

    total = sum(v for k, v in counts.items() if not k.startswith("_"))
    pos = counts.get("PositionReport", 0)
    bstd = counts.get("StandardClassBPositionReport", 0)
    bext = counts.get("ExtendedClassBPositionReport", 0)
    static = counts.get("ShipStaticData", 0) + counts.get("StaticDataReport", 0)

    print("")
    print(f"WebSocket: {'CONNECTED' if connected.is_set() else 'FAILED'}")
    print(f"Subscription: {'SENT' if sub_sent.is_set() else 'FAILED'}"
          + (" (messages flowing = ACCEPTED)" if total else " (no frames yet — ACCEPT unknown)"))
    print("Compression: DISABLED (websocket-client)")
    print("")
    print(f"Messages received: {total}")
    print(f"PositionReport: {pos}")
    print(f"StandardClassBPositionReport: {bstd}")
    print(f"ExtendedClassBPositionReport: {bext}")
    print(f"ShipStaticData: {static}")
    for k in sorted(counts):
        if k not in ("PositionReport", "StandardClassBPositionReport",
                     "ExtendedClassBPositionReport", "ShipStaticData",
                     "StaticDataReport") and not k.startswith("_"):
            print(f"{k}: {counts[k]}")
    if counts.get("_parse_error"):
        print(f"parse_errors: {counts['_parse_error']}")
    print("")
    print(f"India-region messages: {india_msgs}")
    print(f"Unique vessels: {len(mmsis)}")
    if latest:
        print("")
        print("Latest vessel:")
        print(f"MMSI: {latest['mmsi']}")
        print(f"Latitude: {latest['lat']}")
        print(f"Longitude: {latest['lon']}")
        print(f"SOG: {latest['sog']}")
        print(f"COG: {latest['cog']}")
        print(f"Type: {latest['type']}")
        print(f"Timestamp: {latest['ts']}")
    if first_ts:
        print(f"First frame: {datetime.fromtimestamp(first_ts, tz=timezone.utc).isoformat()}")
        print(f"Last frame: {datetime.fromtimestamp(last_ts, tz=timezone.utc).isoformat()}")
    if errors:
        print(f"Socket errors: {len(errors)} (last: {errors[-1]})")
    print("")
    if not connected.is_set():
        print("STATUS: CONNECTION FAILED — check network / endpoint reachability")
    elif total == 0:
        print("STATUS: AISSTREAM CONNECTED BUT NO DATA RECEIVED")
    elif india_msgs == 0 and args.mode != "india":
        print("STATUS: DATA FLOWING GLOBALLY BUT NOTHING INSIDE INDIA BOXES "
              "(narrow progressively: world -> indian-ocean -> india)")
    elif india_msgs > 0:
        print("STATUS: AIS DATA FLOWING")
    else:
        print("STATUS: AISSTREAM CONNECTED BUT NO INDIA DATA IN WINDOW "
              "(lengthen window / retry; do not fabricate vessels)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
