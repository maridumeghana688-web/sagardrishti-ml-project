"""SAGARDRISHTI backend — FastAPI entrypoint (Phase 1: Foundation)."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import router as v1_router
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(
    title=settings.APP_NAME,
    description="SAGARDRISHTI ocean-intelligence platform API (Phase 1 foundation).",
    version="0.1.0",
    debug=settings.DEBUG,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(v1_router, prefix=settings.API_V1_PREFIX)


@app.on_event("startup")
def _start_ais() -> None:
    """Best-effort start of THREE independent AIS provider workers
    (AISStream + Open Waters + VesselAPI) via the aggregator. Non-blocking; each
    worker owns its reconnect loop and survives failures independently."""
    try:
        from app.services.ais_aggregator import AGGREGATOR
        AGGREGATOR.start()
    except Exception:
        pass


@app.on_event("shutdown")
def _stop_ais() -> None:
    try:
        from app.services.ais_aggregator import AGGREGATOR
        AGGREGATOR.stop()
    except Exception:
        pass


@app.get("/", tags=["root"], summary="API root")
def root() -> dict:
    return {
        "service": settings.APP_NAME,
        "environment": settings.APP_ENV,
        "docs": "/docs",
        "health": f"{settings.API_V1_PREFIX}/health",
    }
