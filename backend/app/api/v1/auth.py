"""Application authentication endpoints + reusable access guard.

Stateless JWT (HS256) issued at login; the client presents it as
`Authorization: Bearer <token>`. `get_current_user` is the guard that
future protected routers (datasets, warehouse, ML) must depend on.
"""

import jwt
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import create_access_token, decode_access_token, hash_password, verify_password
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    MessageResponse,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()

_INVALID_CREDENTIALS = "Unable to sign in. Please verify your credentials and try again."


def _unauthorized(detail: str = "Not authenticated.") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    """Access guard: valid, unexpired token for an active account."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise _unauthorized()
    token = authorization[7:].strip()
    if not token:
        raise _unauthorized()
    try:
        payload = decode_access_token(token, settings.SECRET_KEY)
    except jwt.ExpiredSignatureError:
        raise _unauthorized("Session has expired. Please sign in again.")
    except jwt.PyJWTError:
        raise _unauthorized()
    user = db.get(User, payload.get("sub"))
    if user is None or not user.is_active:
        raise _unauthorized()
    return user


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> User:
    # Enforce the live password-length floor (schema carries the absolute floor).
    if len(payload.password) < settings.AUTH_PASSWORD_MIN_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Password must be at least {settings.AUTH_PASSWORD_MIN_LENGTH} characters.",
        )
    existing = db.execute(
        select(User).where(or_(User.user_id == payload.user_id, User.email == payload.email))
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with these credentials already exists.",
        )
    user = User(
        full_name=payload.full_name,
        organization=payload.organization,
        department=payload.department,
        user_id=payload.user_id,
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=payload.role,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    identifier = payload.identifier.lower()
    stmt = select(User).where(
        or_(User.user_id == identifier, User.email == identifier)
        if "@" not in identifier
        else (User.email == identifier)
    )
    user = db.execute(stmt).scalar_one_or_none()
    if user is None or not verify_password(payload.password, user.password_hash):
        raise _unauthorized(_INVALID_CREDENTIALS)
    if not user.is_active:
        raise _unauthorized("This account has been deactivated. Contact your system administrator.")
    if payload.organization and payload.organization.strip().lower() != user.organization.lower():
        raise _unauthorized(_INVALID_CREDENTIALS)
    user.last_login = datetime.now(timezone.utc)
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(
        subject=user.id,
        user_id=user.user_id,
        role=user.role,
        secret_key=settings.SECRET_KEY,
        app_env=settings.APP_ENV,
        expires_minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES,
    )
    return TokenResponse(
        access_token=token,
        expires_in_minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES,
        user=user,
    )


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@router.post("/logout", response_model=MessageResponse)
def logout() -> MessageResponse:
    # Tokens are stateless: the server holds no session to destroy. Logout
    # clears the client-side credential (see frontend auth client), which is
    # what revokes access from that device. Short expiries bound the window.
    return MessageResponse(detail="Signed out.")
