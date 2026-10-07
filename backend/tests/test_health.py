"""Phase 1 smoke tests: app boots and /health responds without a database."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_root_returns_service_info():
    res = client.get("/")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok" if "status" in body else body["service"] == "SAGARDRISHTI"


def test_health_endpoint():
    res = client.get("/api/v1/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["service"] == "SAGARDRISHTI"
    assert "environment" in body
