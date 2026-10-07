"""Ops-center additive tests: observed tracks, event feed, SSE slim shape.

Backward-compatible: existing snapshot fields must remain intact.
"""
import time

from fastapi.testclient import TestClient

from app.main import app
from app.services import aisstream as svc

client = TestClient(app)


def _seed_tracked():
    now = time.time()
    svc.SERVICE._vessels = {
        123456789: {"mmsi": 123456789, "ship_name": "TEST SHIP", "latitude": 18.9, "longitude": 72.5,
                    "sog": 10.0, "cog": 90.0, "heading": 90, "timestamp": "2026-09-30T00:00:00Z",
                    "last_seen": now, "source": "AISSTREAM"},
    }
    svc.SERVICE._tracks = {
        123456789: [{"lat": 18.8, "lon": 72.4, "ts": now - 30}, {"lat": 18.9, "lon": 72.5, "ts": now}],
    }
    svc.SERVICE._assoc_state = {}
    svc.SERVICE._events = [{"ts": "2026-09-30T00:00:00+00:00", "kind": "connection", "message": "test event"}]


def test_snapshot_includes_observed_track():
    _seed_tracked()
    body = client.get("/api/v1/vessels").json()
    v = {x["mmsi"]: x for x in body["vessels"]}[123456789]
    # legacy fields intact
    assert v["freshness"] == "LIVE" and v["vessel_status"] in (
        "APPROACHING", "DEPARTING", "NEAR PORT", "WITHIN PORT RADIUS", "OFFSHORE", "UNKNOWN")
    # new additive fields: observed fixes only, current fix excluded
    assert isinstance(v["track"], list)
    assert all(set(p) >= {"lat", "lon", "ts"} for p in v["track"])
    assert len(v["track"]) <= 11


def test_snapshot_without_history_still_works():
    svc.SERVICE._vessels = {
        222222222: {"mmsi": 222222222, "latitude": 10.0, "longitude": 80.0,
                    "last_seen": time.time(), "source": "AISSTREAM"},
    }
    svc.SERVICE._tracks = {}
    svc.SERVICE._assoc_state = {}
    body = client.get("/api/v1/vessels").json()
    v = {x["mmsi"]: x for x in body["vessels"]}[222222222]
    assert v["track"] == []


def test_events_endpoint_real_only():
    _seed_tracked()
    body = client.get("/api/v1/events").json()
    assert body["count"] >= 1
    assert set(body["events"][0]) >= {"ts", "kind", "message"}
    assert client.get("/api/v1/events", params={"limit": 1}).json()["count"] <= 1


def test_track_never_contains_future_positions():
    now = time.time()
    svc.SERVICE._vessels = {
        333333333: {"mmsi": 333333333, "latitude": 15.0, "longitude": 73.0,
                    "last_seen": now, "source": "AISSTREAM"},
    }
    svc.SERVICE._tracks = {
        333333333: [{"lat": 15.0, "lon": 73.0, "ts": now + 3600}],  # corrupt future fix
    }
    svc.SERVICE._assoc_state = {}
    v = {x["mmsi"]: x for x in client.get("/api/v1/vessels").json()["vessels"]}[333333333]
    assert all(p["ts"] <= now + 1 for p in v["track"])


def test_no_key_exposure_in_new_endpoints():
    import json as _json
    blob = _json.dumps([client.get(u).json() for u in ("/api/v1/vessels", "/api/v1/events", "/api/v1/system/status")])
    assert "AISSTREAM_API_KEY" not in blob
