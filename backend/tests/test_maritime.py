"""Maritime ML API tests: real artifacts, no secrets, honest nulls."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_ports_count():
    body = client.get("/api/v1/ports").json()
    assert body["count"] == 44 and len(body["ports"]) == 44
    names = {p["name"] for p in body["ports"]}
    assert {"PARADIP", "MUMBAI"}.issubset(names) or "PARADIP" in names


def test_port_detail_from_wpi():
    body = client.get("/api/v1/ports/49535").json()
    assert body["port"]["name"] == "PARADIP"
    assert abs(body["port"]["latitude"] - 20.266667) < 1e-4


def test_unknown_port_404():
    assert client.get("/api/v1/ports/1").status_code == 404


def test_prediction_shape():
    body = client.get("/api/v1/predictions/49535").json()
    p = body["prediction"]
    assert set(p) >= {"date", "traffic", "traffic_lower", "traffic_upper", "congestion", "congestion_lower", "congestion_upper"}
    assert p["traffic_upper"] >= p["traffic"] >= p["traffic_lower"]
    assert body["model"]["traffic_version"] == "daily_traffic_model_v1"
    assert "NO RECENT READING" in body["waiting_time"]
    assert body["model"]["traffic_trained_at"] == "2026-09-30T06:35:38.192108+00:00"
    assert body["model"]["training_period"] == "2021-01-01..2024-12-31"


def test_predictions_by_date_count():
    body = client.get("/api/v1/predictions", params={"date": "2026-08-15"}).json()
    assert body["count"] == 44 and body["date"] == "2026-08-15"


def test_environment_honest_nulls():
    body = client.get("/api/v1/environment/49535").json()
    assert len(body["points"]) == 30
    assert all(v is None for v in [pt["sst"] for pt in body["points"]]), "post-2023 SST must be null, not fabricated"


def test_vessel_activity_real():
    body = client.get("/api/v1/vessel-activity/49535").json()
    assert any(pt["presence_hours"] > 0 for pt in body["points"])


def test_sources_noaa_historical():
    body = client.get("/api/v1/sources/status").json()
    assert body["sources"]["noaa"] == "HISTORICAL"
    assert body["sources"]["gfw"] == "CURRENT"


def test_no_secrets_leaked():
    import json as _json
    blob = _json.dumps([client.get(u).json() for u in (
        "/api/v1/ports", "/api/v1/sources/status", "/api/v1/predictions/49535")])
    assert "Bearer " not in blob and "GFW_API_TOKEN" not in blob
