"""API v1 router. Phase 2 mounts dataset/ingestion routers here."""
from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.health import router as health_router
from app.api.v1.live import router as live_router
from app.api.v1.maritime import router as maritime_router

router = APIRouter()
router.include_router(health_router)
router.include_router(auth_router)
router.include_router(live_router)  # static paths first: /predictions/daily, /analytics/overview
router.include_router(maritime_router)
