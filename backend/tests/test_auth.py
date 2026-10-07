"""Authentication flow tests: register → login → me → logout + guards.

Runs against a disposable SQLite database (dependency override), so no
PostgreSQL is required. The users table is dialect-agnostic by design.
"""
import os
import tempfile

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

_tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_tmp.close()
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp.name}"

from app.core.security import create_access_token  # noqa: E402
from app.db.session import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402

engine = create_engine(
    f"sqlite:///{_tmp.name}",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def _override_db():
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = _override_db
Base.metadata.create_all(engine)

client = TestClient(app)


@pytest.fixture
def user_payload():
    return {
        "full_name": "Asha Verma",
        "organization": "Port Operations",
        "department": "Berth Planning",
        "user_id": "asha.verma",
        "email": "asha.verma@example.gov.in",
        "password": "HarbourLight42",
        "confirm_password": "HarbourLight42",
        "role": "analyst",
    }


def _register(payload):
    return client.post("/api/v1/auth/register", json=payload)


def _login(identifier, password, organization=None):
    body = {"identifier": identifier, "password": password}
    if organization is not None:
        body["organization"] = organization
    return client.post("/api/v1/auth/login", json=body)


def test_register_creates_account_without_privilege_escalation(user_payload):
    res = _register(user_payload)
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["user_id"] == "asha.verma"
    assert body["email"] == "asha.verma@example.gov.in"
    assert body["role"] == "analyst"
    assert body["is_active"] is True
    assert "password_hash" not in body
    assert "password" not in body


def test_register_rejects_duplicate_user_id(user_payload):
    payload = dict(user_payload, email="different@example.gov.in")
    res = _register(payload)
    assert res.status_code == 409
    assert "already exists" in res.json()["detail"]


def test_register_rejects_duplicate_email(user_payload):
    payload = dict(user_payload, user_id="someone.else")
    res = _register(payload)
    assert res.status_code == 409


def test_register_rejects_bad_email(user_payload):
    payload = dict(user_payload, user_id="bad.email", email="not-an-email")
    res = _register(payload)
    assert res.status_code == 422


def test_register_rejects_weak_password(user_payload):
    payload = dict(user_payload, user_id="weak.pass", email="weak@example.gov.in",
                    password="short1", confirm_password="short1")
    res = _register(payload)
    assert res.status_code == 422


def test_register_rejects_mismatched_passwords(user_payload):
    payload = dict(user_payload, user_id="mismatch.x", email="mismatch@example.gov.in",
                    confirm_password="Different99")
    res = _register(payload)
    assert res.status_code == 422


def test_register_rejects_admin_role(user_payload):
    for bad_role in ("admin", "ADMIN", "Administrator"):
        payload = dict(user_payload, user_id=f"noadmin-{bad_role[:3]}", email=f"noadmin-{bad_role[:3]}@example.gov.in",
                        role=bad_role)
        res = _register(payload)
        assert res.status_code == 422, bad_role


def test_register_defaults_to_viewer(user_payload):
    payload = dict(user_payload)
    payload.pop("role")
    payload["user_id"] = "default.role"
    payload["email"] = "default.role@example.gov.in"
    res = _register(payload)
    assert res.status_code == 201
    assert res.json()["role"] == "viewer"


def test_login_with_user_id_and_email(user_payload):
    res = _login("asha.verma", "HarbourLight42")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert body["user"]["user_id"] == "asha.verma"

    res = _login("asha.verma@example.gov.in", "HarbourLight42")
    assert res.status_code == 200


def test_login_rejects_wrong_password_and_unknown_user(user_payload):
    assert _login("asha.verma", "WrongPassword1").status_code == 401
    assert _login("nobody.here", "Whatever123").status_code == 401


def test_login_rejects_organization_mismatch(user_payload):
    assert _login("asha.verma", "HarbourLight42", organization="Wrong Org").status_code == 401
    assert _login("asha.verma", "HarbourLight42", organization="port operations").status_code == 200


def test_me_requires_valid_token(user_payload):
    assert client.get("/api/v1/auth/me").status_code == 401
    assert client.get("/api/v1/auth/me", headers={"Authorization": "Bearer junk"}).status_code == 401

    token = _login("asha.verma", "HarbourLight42").json()["access_token"]
    res = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert res.json()["user_id"] == "asha.verma"
    assert "password_hash" not in res.json()


def test_me_rejects_expired_token():
    expired = create_access_token(
        subject="any-id", user_id="any", role="viewer",
        secret_key="change-me-in-dotenv", app_env="development", expires_minutes=-1,
    )
    res = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {expired}"})
    assert res.status_code == 401


def test_inactive_account_cannot_sign_in(user_payload):
    payload = dict(user_payload, user_id="dormant.user", email="dormant@example.gov.in")
    assert _register(payload).status_code == 201
    # deactivate directly through a fresh session
    from app.models.user import User

    db = TestingSession()
    try:
        user = db.query(User).filter(User.user_id == "dormant.user").one()
        user.is_active = False
        db.commit()
    finally:
        db.close()
    assert _login("dormant.user", "HarbourLight42").status_code == 401


def test_logout_returns_ok_with_token(user_payload):
    token = _login("asha.verma", "HarbourLight42").json()["access_token"]
    res = client.post("/api/v1/auth/logout", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
