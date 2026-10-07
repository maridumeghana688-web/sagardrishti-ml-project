"""Declarative base for ORM models.

Phase 2+ models (e.g. PostGIS tables for ingested datasets) should import
`Base` from here and live under `app/models/`.
"""
from app.db.session import Base  # noqa: F401
