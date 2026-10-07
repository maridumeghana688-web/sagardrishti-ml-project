"""Pydantic schemas for application authentication.

Backend validation is mandatory — frontend validation is never sufficient.
"""

import re
from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator

# Controlled role vocabulary. Administrator accounts are never self-registered.
ALLOWED_ROLES = {
    "analyst": "Analyst",
    "operations": "Operations Officer",
    "logistics": "Logistics Analyst",
    "viewer": "Viewer",
}

_USER_ID_RE = re.compile(r"^[a-z0-9._-]{3,32}$")
_EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")


def normalize_role(value: str) -> str:
    """Accept slugs or display names (case-insensitive); reject admin."""
    slug = value.strip().lower().replace(" ", "_")
    if slug in {"admin", "administrator", "superuser", "root"}:
        raise ValueError("Administrator accounts cannot be self-registered.")
    if slug == "operations_officer":
        slug = "operations"
    if slug == "logistics_analyst":
        slug = "logistics"
    if slug not in ALLOWED_ROLES:
        raise ValueError(f"Role must be one of: {', '.join(sorted(ALLOWED_ROLES))}.")
    return slug


def _check_password_strength(value: str, min_length: int) -> str:
    if len(value) < min_length:
        raise ValueError(f"Password must be at least {min_length} characters.")
    if len(value.encode("utf-8")) > 72:
        # bcrypt operates on the first 72 bytes; reject longer secrets explicitly
        # rather than silently truncating.
        raise ValueError("Password must be at most 72 characters.")
    if not re.search(r"[A-Za-z]", value) or not re.search(r"\d", value):
        raise ValueError("Password must contain at least one letter and one digit.")
    return value


class RegisterRequest(BaseModel):
    full_name: str
    organization: str
    department: str | None = None
    user_id: str
    email: str
    password: str
    confirm_password: str
    role: str = "viewer"

    @field_validator("full_name", "organization")
    @classmethod
    def _non_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("This field is required.")
        return v

    @field_validator("department")
    @classmethod
    def _optional_stripped(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        return v or None

    @field_validator("user_id")
    @classmethod
    def _valid_user_id(cls, v: str) -> str:
        v = v.strip().lower()
        if not _USER_ID_RE.match(v):
            raise ValueError("User ID must be 3–32 characters: letters, digits, . _ -.")
        return v

    @field_validator("email")
    @classmethod
    def _valid_email(cls, v: str) -> str:
        v = v.strip().lower()
        if not _EMAIL_RE.match(v):
            raise ValueError("Enter a valid official email address.")
        return v

    @field_validator("password")
    @classmethod
    def _strong_password(cls, v: str) -> str:
        # Default policy floor; the route re-checks against live settings.
        return _check_password_strength(v, 10)

    @field_validator("role")
    @classmethod
    def _allowed_role(cls, v: str) -> str:
        return normalize_role(v)

    @field_validator("confirm_password")
    @classmethod
    def _matches(cls, v: str, info) -> str:
        if info.data.get("password") is not None and v != info.data["password"]:
            raise ValueError("Passwords do not match.")
        return v


class LoginRequest(BaseModel):
    identifier: str  # User ID or official email
    password: str
    organization: str | None = None  # if supplied, must match the account

    @field_validator("identifier")
    @classmethod
    def _non_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Enter your User ID or official email.")
        return v


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    full_name: str
    organization: str
    department: str | None
    user_id: str
    email: str
    role: str
    is_active: bool
    created_at: datetime | None = None
    last_login: datetime | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in_minutes: int
    user: UserResponse


class MessageResponse(BaseModel):
    detail: str
