"""Health endpoints — liveness probes with no dataset/ML dependencies."""
from fastapi import APIRouter

from app.core.config import get_settings
from app.db.session import check_database
from app.schemas.health import DbHealthResponse, HealthResponse

router = APIRouter(tags=["health"])
settings = get_settings()


@router.get("/health", response_model=HealthResponse, summary="Service liveness")
def health() -> HealthResponse:
    return HealthResponse(status="ok", service=settings.APP_NAME, environment=settings.APP_ENV)


@router.get("/health/db", response_model=DbHealthResponse, summary="Database connectivity")
def health_db() -> DbHealthResponse:
    ok, detail = check_database()
    return DbHealthResponse(database="up" if ok else "down", detail=detail)
