"""AIS coverage test against the 44 SAGARDRISHTI monitored ports.

Usage (from repo root):
    py -m app.services.ais_coverage_test --provider openwaters --all-ports
    py -m app.services.ais_coverage_test --provider vesselapi --all-ports
    py -m app.services.ais_coverage_test --provider vesselapi --port Mumbai
    py -m app.services.ais_coverage_test --provider vesselapi --all-ports --json

One small HTTP box per port (polite pacing). HTTP 200 with zero vessels is
reported as API_REACHABLE_NO_VESSELS — never as coverage.
VesselAPI calls consume monthly quota: first result page only, quota guard
aborts before exhaustion.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.parse
from datetime import datetime, timezone

sys.path.insert(0, ".")
sys.path.insert(0, "backend")

HALF_DEG = 0.6
VA_HALF_DEG = 0.7  # |dLat| + |dLon| = 2.8 <= documented 4-deg bbox limit
FRESH_S = 15 * 60
RECENT_S = 60 * 60
VA_QUOTA_FLOOR = 12


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="AIS coverage test (44 monitored ports)")
    p.add_argument("--provider", default="openwaters", choices=["openwaters", "vesselapi"],
                   help="provider under test")
    p.add_argument("--port", default=None, help="single port name (substring) or WPI id")
    p.add_argument("--all-ports", action="store_true", help="test all 44 monitored ports")
    p.add_argument("--json", action="store_true", help="emit machine-readable JSON summary")
    p.add_argument("--pace", type=float, default=1.0, help="seconds between port queries")
    return p.parse_args()


def _ports():
    import pandas as pd
    from pathlib import Path
    root = Path(__file__).resolve().parents[3]
    df = pd.read_parquet(root / "data" / "reference" / "india_ports.parquet")
    return [{"port_id": int(r.port_id), "port_name": str(r.port_name),
             "latitude": float(r.latitude), "longitude": float(r.longitude)}
            for r in df.itertuples()]


def _query_openwaters(box, limit=200):
    import httpx
    la0, lo0, la1, lo1 = box
    url = f"https://ais.openwaters.io/v1/vessels?bbox={la0},{lo0},{la1},{lo1}&limit={limit}"
    headers = {"User-Agent": "SAGARDRISHTI-coverage-test/1.0",
               "Accept": "application/json"}
    # Authenticated free personal token when configured (backend-only, never
    # printed); anonymous access otherwise. Same job either way.
    try:
        from app.services.openwaters import _load_token as _ow_token
        _tok = _ow_token()
    except Exception:
        _tok = ""
    if _tok:
        headers["Authorization"] = f"Bearer {_tok}"
    try:
        resp = httpx.get(url, headers=headers, timeout=30)
    except Exception as exc:
        return ("API_ERROR", f"{type(exc).__name__}: {str(exc)[:120]}", [])
    if resp.status_code == 429:
        return ("RATE_LIMITED", "HTTP 429", [])
    if resp.status_code != 200:
        return ("API_ERROR", f"HTTP {resp.status_code}", [])
    try:
        feats = resp.json().get("features") or []
    except Exception:
        return ("API_ERROR", "invalid JSON", [])
    return ("OK", f"HTTP 200, {len(feats)} features", feats)


def _vesselapi_key() -> str:
    from app.services.vesselapi import _load_key
    return _load_key()


def _query_vesselapi(box, limit=50):
    """One bbox page (first page only — quota discipline). Returns
    (status, note, items). Quota guard raises _QuotaFloor when remaining is low."""
    import httpx
    la0, lo0, la1, lo1 = box
    q = urllib.parse.urlencode({
        "filter.latBottom": la0, "filter.lonLeft": lo0,
        "filter.latTop": la1, "filter.lonRight": lo1,
        "pagination.limit": limit})
    url = f"https://api.vesselapi.com/v1/location/vessels/bounding-box?{q}"
    try:
        resp = httpx.get(url, headers={"Authorization": f"Bearer {_vesselapi_key()}",
                                       "Accept": "application/json",
                                       "User-Agent": "SAGARDRISHTI-coverage-test/1.0"}, timeout=30)
    except Exception as exc:
        return ("API_ERROR", f"{type(exc).__name__}: {str(exc)[:120]}", [])
    try:
        rem = resp.headers.get("X-RateLimit-Remaining")
        remaining = int(rem) if rem not in (None, "", "Unlimited") else None
    except (TypeError, ValueError):
        remaining = None
    if resp.status_code == 401:
        return ("AUTHENTICATION_ERROR", "HTTP 401 invalid key", [])
    if resp.status_code == 403:
        return ("AUTHENTICATION_ERROR", "HTTP 403 key suspended", [])
    if resp.status_code == 429:
        return ("RATE_LIMITED", "HTTP 429", [])
    if resp.status_code != 200:
        return ("API_ERROR", f"HTTP {resp.status_code}", [])
    try:
        body = resp.json()
        items = body.get("vessels") or []
        paged = " (+more pages)" if body.get("nextToken") else ""
    except Exception:
        return ("API_ERROR", "invalid JSON", [])
    note = f"HTTP 200, {len(items)} vessels{paged}"
    if remaining is not None:
        note += f", quota remaining {remaining}"
        if remaining < VA_QUOTA_FLOOR:
            raise _QuotaFloor(remaining)
    return ("OK", note, items)


class _QuotaFloor(Exception):
    def __init__(self, remaining):
        super().__init__(f"quota floor reached ({remaining} remaining)")
        self.remaining = remaining


def main() -> int:
    args = _parse_args()
    from app.services.ais_normalize import normalize_openwaters_feature, normalize_vesselapi_record

    provider = args.provider
    if provider == "vesselapi" and not _vesselapi_key():
        print("VESSELAPI COVERAGE TEST")
        print("Status: NOT_CONFIGURED (VESSELAPI_API_KEY missing — set it in server .env)")
        return 3

    ports = _ports()
    if args.port:
        key = str(args.port).strip().lower()
        ports = [p for p in ports if key in p["port_name"].lower() or key == str(p["port_id"])]
        if not ports:
            print(f"No monitored port matches {args.port!r}")
            return 2
    elif not args.all_ports:
        print("Pass --port <name> or --all-ports")
        return 2

    half = VA_HALF_DEG if provider == "vesselapi" else HALF_DEG
    normalize = normalize_vesselapi_record if provider == "vesselapi" else normalize_openwaters_feature
    query = _query_vesselapi if provider == "vesselapi" else _query_openwaters
    example_keys = (("mmsi", "vessel_name", "latitude", "longitude", "sog",
                     "cog", "heading", "timestamp", "source", "upstream_source")
                    if provider == "vesselapi" else
                    ("mmsi", "vessel_name", "latitude", "longitude", "sog",
                     "cog", "heading", "timestamp", "source",
                     "source_station", "upstream_source"))

    now = time.time()
    results = []
    all_mmsi = set()
    aborted = None
    for port in ports:
        la, lo = port["latitude"], port["longitude"]
        box = (round(la - half, 3), round(lo - half, 3),
               round(la + half, 3), round(lo + half, 3))
        try:
            status, note, items = query(box)
        except _QuotaFloor as qf:
            aborted = str(qf)
            break
        recs = []
        if status == "OK":
            for f in items:
                r = normalize(f, now)
                if r is not None:
                    recs.append(r)
                    all_mmsi.add(r["mmsi"])
        ages = [now - r["last_seen"] for r in recs]
        fresh = sum(1 for a in ages if a <= FRESH_S)
        recent = sum(1 for a in ages if a <= RECENT_S)
        moving = sum(1 for r in recs if isinstance(r.get("sog"), (int, float)) and r["sog"] >= 0.5)
        if status != "OK":
            verdict = status
        elif not recs:
            verdict = "API_REACHABLE_NO_VESSELS"
        elif recent > 0:
            verdict = "RECENT_AIS_COVERAGE"
        else:
            verdict = "STALE_AIS_ONLY"
        results.append({"port": port["port_name"], "port_id": port["port_id"],
                        "lat": la, "lon": lo, "bbox": list(box),
                        "verdict": verdict, "note": note,
                        "vessels": len(recs), "unique_mmsi": len({r["mmsi"] for r in recs}),
                        "fresh": fresh, "recent": recent, "moving": moving,
                        "stationary": len(recs) - moving,
                        "oldest_seen": min((r["timestamp"] for r in recs), default=None),
                        "newest_seen": max((r["timestamp"] for r in recs), default=None),
                        "examples": [{k: r.get(k) for k in example_keys}
                                     for r in sorted(recs, key=lambda r: r["last_seen"], reverse=True)[:5]]})
        time.sleep(max(0.2, args.pace))

    covered = [r for r in results if r["verdict"] == "RECENT_AIS_COVERAGE"]
    title = "VESSELAPI" if provider == "vesselapi" else "OPEN WATERS"
    if provider == "vesselapi":
        auth = "key (Bearer, backend-only)"
    else:
        try:
            from app.services.openwaters import _load_token as _ow_token
            auth = "token (Bearer, backend-only)" if _ow_token() else "anonymous / no token"
        except Exception:
            auth = "anonymous / no token"
    summary = {"provider": title, "auth": auth,
               "ports_tested": len(results),
               "ports_with_recent_coverage": len(covered),
               "ports_without_recent_coverage": len(results) - len(covered),
               "total_unique_vessels": len(all_mmsi),
               "aborted": aborted,
               "results": results}
    if args.json:
        print(json.dumps(summary, indent=1, default=str))
        return 0

    print(f"{title} AIS COVERAGE TEST")
    print(f"Provider: {title} | Auth: {auth}")
    print("=" * 70)
    for r in results:
        print(f"\nPort: {r['port']} (WPI {r['port_id']})  [{r['lat']}, {r['lon']}]")
        print(f"Box: {r['bbox']}  ({r['note']})")
        print(f"Vessels: {r['vessels']} (unique MMSI {r['unique_mmsi']})  "
              f"fresh<=15m: {r['fresh']}  recent<=60m: {r['recent']}  "
              f"moving: {r['moving']}  stationary: {r['stationary']}")
        print(f"Oldest: {r['oldest_seen']}  Newest: {r['newest_seen']}")
        for e in r["examples"][:3]:
            age = ""
            try:
                ts = datetime.fromisoformat(str(e["timestamp"]).replace("Z", "+00:00")).timestamp()
                age = f" age={max(0, now - ts):.0f}s"
            except Exception:
                pass
            print(f"  MMSI {e['mmsi']} {e['vessel_name'] or '—'} "
                  f"{e['latitude']},{e['longitude']} SOG={e['sog']} COG={e['cog']} "
                  f"HDG={e['heading']} seen={e['timestamp']}{age} src={e.get('upstream_source')}/{e.get('source_station')}")
        print(f"=> {r['verdict']}")
    print("\n" + "=" * 70)
    print(f"Ports with confirmed live/recent coverage: {len(covered)}")
    print(f"Ports with no recent coverage: {len(results) - len(covered)}")
    print(f"Total unique vessels observed: {len(all_mmsi)}")
    if aborted:
        print(f"ABORTED EARLY: {aborted} — remaining ports untested to protect quota")
    if covered:
        print("Covered: " + ", ".join(r["port"] for r in covered))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
