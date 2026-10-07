"""Application-level authentication primitives.

Stateless JWT access tokens (HS256) + bcrypt password hashing.
No sessions, no external identity providers in this phase.
"""

from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

ALGORITHM = "HS256"
_DEV_PLACEHOLDER_SECRET = "change-me-in-dotenv"


def hash_password(plain_password: str) -> str:
    """Hash a password with bcrypt. Never store or log plaintext."""
    return bcrypt.hashpw(plain_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, password_hash: str) -> bool:
    """Constant-work password check. Returns False for malformed hashes."""
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def _require_production_secret(secret_key: str, app_env: str) -> None:
    if app_env == "production" and secret_key == _DEV_PLACEHOLDER_SECRET:
        raise RuntimeError(
            "Refusing to issue tokens: SECRET_KEY is the development placeholder. "
            "Set a long random SECRET_KEY in the production environment."
        )


def create_access_token(
    *,
    subject: str,
    user_id: str,
    role: str,
    secret_key: str,
    app_env: str,
    expires_minutes: int,
) -> str:
    """Mint a short-lived JWT. Payload carries identity only — no secrets."""
    _require_production_secret(secret_key, app_env)
    now = datetime.now(timezone.utc)
    payload = {
        "sub": subject,
        "uid": user_id,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=expires_minutes)).timestamp()),
    }
    return jwt.encode(payload, secret_key, algorithm=ALGORITHM)


def decode_access_token(token: str, secret_key: str) -> dict:
    """Validate signature + expiry. Raises jwt.PyJWTError on any failure."""
    return jwt.decode(token, secret_key, algorithms=[ALGORITHM])
