"""Live AIS endpoint tests (no network; controlled service state)."""
import time

from fastapi.testclient import TestClient

from app.main import app
from app.services import aisstream as svc

client = TestClient(app)


def _seed():
    now = time.time()
    svc.SERVICE._vessels = {
        123456789: {"mmsi": 123456789, "ship_name": "TEST SHIP", "latitude": 18.9, "longitude": 72.5,
                    "sog": 10.0, "cog": 90.0, "heading": 90, "timestamp": "2026-09-30T00:00:00Z",
                    "last_seen": now, "source": "AISSTREAM"},
        987654321: {"mmsi": 987654321, "latitude": 6.0, "longitude": 80.0, "sog": 0.0, "cog": None,
                    "timestamp": "2026-09-30T00:00:00Z", "last_seen": now - 600, "source": "AISSTREAM"},
    }


def test_vessels_snapshot_schema():
    _seed()
    body = client.get("/api/v1/vessels").json()
    assert body["count"] == 2
    v = {x["mmsi"]: x for x in body["vessels"]}[123456789]
    assert v["freshness"] == "LIVE" and v["source"] == "AISSTREAM"
    assert "associated_port_id" in v and "vessel_status" in v and "distance_to_port_km" in v
    stale = {x["mmsi"]: x for x in body["vessels"]}[987654321]
    assert stale["freshness"] == "STALE"


def test_vessels_filter_status():
    _seed()
    assert client.get("/api/v1/vessels", params={"status": "LIVE"}).json()["count"] == 1


def test_vessel_detail_and_mmsi_validation():
    _seed()
    assert client.get("/api/v1/vessels/123456789").json()["vessel"]["ship_name"] == "TEST SHIP"
    assert client.get("/api/v1/vessels/123").status_code == 422
    assert client.get("/api/v1/vessels/111111111").status_code == 404


def test_port_vessels_stats():
    _seed()
    body = client.get("/api/v1/ports/48630/vessels").json()
    assert body["port_id"] == 48630 and "by_status" in body and "avg_sog" in body
    assert client.get("/api/v1/ports/0/vessels").status_code == 422


def test_system_status_shape():
    body = client.get("/api/v1/system/status").json()
    assert "connected" in body["aisstream"] and body["aisstream"]["mode"] == "EVENT_DRIVEN"
    assert "bounding_boxes" in body["aisstream"]


def test_predictions_daily_alias():
    body = client.get("/api/v1/predictions/daily").json()
    assert body["count"] == 44


def test_analytics_overview():
    body = client.get("/api/v1/analytics/overview").json()
    assert body["ports"] == 44 and "traffic" in body and "live_vessels" in body


def test_sse_stream_first_frame():
    import asyncio
    from app.api.v1.live import ais_stream
    async def one():
        resp = await ais_stream()
        assert resp.media_type == "text/event-stream"
        async for chunk in resp.body_iterator:
            assert chunk.startswith("data: ")
            return True
        return False
    assert asyncio.run(asyncio.wait_for(one(), timeout=15))


def test_no_key_exposure():
    import json as _json
    blob = _json.dumps([client.get(u).json() for u in ("/api/v1/vessels", "/api/v1/system/status", "/api/v1/analytics/overview")])
    assert "AISSTREAM_API_KEY" not in blob
