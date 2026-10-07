"""Database engine / session factories (PostgreSQL + PostGIS ready).

Phase 1 does not require a live database for `/health`, but the session
helpers are wired and PostGIS-compatible so Phase 2 ingestion pipelines can
use them without restructuring.
"""

from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker

from app.core.config import get_settings

settings = get_settings()

# `pool_pre_ping` avoids stale-connection errors behind docker networking.
_engine_kwargs: dict = {"pool_pre_ping": True}
if settings.DATABASE_URL.startswith("sqlite"):
    # Local/test only: allow the file DB to be shared across API threads.
    _engine_kwargs["connect_args"] = {"check_same_thread": False}
engine = create_engine(settings.DATABASE_URL, future=True, **_engine_kwargs)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)

Base = declarative_base()


def get_db():
    """FastAPI dependency yielding a SQLAlchemy session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def check_database() -> tuple[bool, str]:
    """Lightweight connectivity probe used by the `/health/db` endpoint."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True, "ok"
    except Exception as exc:  # noqa: BLE001 — surfaced as health status, not raised
        return False, str(exc)[:300]
