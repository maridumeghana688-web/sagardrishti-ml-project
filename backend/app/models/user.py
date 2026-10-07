"""User account model for application-level authentication.

Dialect-agnostic column types (no PostgreSQL-only types) so the same model
runs on PostgreSQL/PostGIS in deployment and SQLite in tests.
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    organization: Mapped[str] = mapped_column(String(160), nullable=False)
    department: Mapped[str | None] = mapped_column(String(160), nullable=True, default=None)
    # Login handle chosen at registration; always stored lowercase.
    user_id: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    # analyst | operations | logistics | viewer. Admin accounts are never
    # self-registered; they are created out-of-band.
    role: Mapped[str] = mapped_column(String(32), nullable=False, default="viewer")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    last_login: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=None)
