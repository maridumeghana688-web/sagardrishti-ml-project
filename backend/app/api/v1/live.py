"""Live AIS endpoints: snapshot REST + SSE stream. Sanitized vessel data only; key never leaves server."""
from __future__ import annotations

import asyncio
import json
import time

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from app.services.aisstream import FRESH_LIVE_S, FRESH_RECENT_S, SERVICE
from app.services.ais_aggregator import AGGREGATOR

router = APIRouter(tags=["live-ais"])


def _valid_mmsi_path(mmsi: int) -> int:
    if not 100000000 <= int(mmsi) <= 999999999:
        raise HTTPException(status_code=422, detail="Invalid MMSI (9 digits required)")
    return int(mmsi)


@router.get("/vessels")
def vessels(status: str | None = Query(default=None, pattern="^(LIVE|RECENT|STALE)$"),
            port_id: int | None = None, limit: int = Query(default=500, le=2000)):
    snap = AGGREGATOR.snapshot()
    if status:
        snap = [v for v in snap if v["freshness"] == status]
    if port_id is not None:
        if port_id <= 0:
            raise HTTPException(status_code=422, detail="Invalid port_id")
        snap = [v for v in snap if v.get("associated_port_id") == int(port_id)]
    health = AGGREGATOR.health()
    return {"count": len(snap), "vessels": snap[:limit], "health": health,
            "sources": health["sources"], "aggregation": health["aggregation"]}


@router.get("/vessels/{mmsi}")
def vessel_detail(mmsi: int):
    mmsi = _valid_mmsi_path(mmsi)
    for v in AGGREGATOR.snapshot():
        if v["mmsi"] == mmsi:
            return {"vessel": v}
    raise HTTPException(status_code=404, detail="Vessel not currently tracked")


@router.get("/ports/{port_id}/vessels")
def port_vessels(port_id: int):
    if port_id <= 0:
        raise HTTPException(status_code=422, detail="Invalid port_id")
    snap = [v for v in AGGREGATOR.snapshot() if v.get("associated_port_id") == int(port_id)]
    by_status: dict[str, int] = {}
    for v in snap:
        by_status[v["vessel_status"]] = by_status.get(v["vessel_status"], 0) + 1
    sogs = [v["sog"] for v in snap if isinstance(v.get("sog"), (int, float))]
    dists = [v["distance_to_port_km"] for v in snap if isinstance(v.get("distance_to_port_km"), (int, float))]
    return {"port_id": int(port_id), "vessels_nearby": len(snap), "by_status": by_status,
            "avg_sog": round(sum(sogs) / len(sogs), 2) if sogs else None,
            "avg_distance_km": round(sum(dists) / len(dists), 2) if dists else None,
            "vessels": snap[:200]}


@router.get("/system/status")
def system_status():
    health = AGGREGATOR.health()
    return {"aisstream": health["sources"]["aisstream"],
            "openwaters": health["sources"]["openwaters"],
            "vesselapi": health["sources"]["vesselapi"],
            "sources": health["sources"], "aggregation": health["aggregation"],
            "ais_status": health["ais_status"],
            "thresholds": {"live_s": FRESH_LIVE_S, "recent_s": FRESH_RECENT_S}}


@router.get("/events")
def maritime_events(limit: int = Query(default=25, le=60)):
    """Real backend event feed only: connections, first-seen vessels, port-association
    transitions. Empty list when nothing has happened — never synthesized."""
    return {"count": len(SERVICE.recent_events(limit)), "events": SERVICE.recent_events(limit)}


@router.get("/predictions/daily")
def predictions_daily(date: str | None = None):
    from app.api.v1.maritime import predictions_by_date, _predictions
    p = _predictions()
    return predictions_by_date(date or str(p["target_date"].max()))


@router.get("/analytics/overview")
def analytics_overview():
    from app.api.v1.maritime import _ports, _predictions
    ports = _ports()
    preds = _predictions()
    latest = str(preds["target_date"].max())
    g = preds[preds["target_date"] == latest]
    return {"ports": int(len(ports)), "prediction_date": latest,
            "traffic": {"mean": round(float(g["traffic_prediction"].mean()), 1), "max": round(float(g["traffic_prediction"].max()), 1)},
            "congestion": {"mean": round(float(g["congestion_prediction"].mean()), 4)},
            "live_vessels": len(AGGREGATOR.snapshot()), "ais_health": AGGREGATOR.health()}


@router.get("/live/ais/stream")
async def ais_stream():
    """SSE: full compact snapshot every 3s + heartbeat. Backend consumes AIS event-driven;
    this endpoint serves state (it is not AIS polling)."""
    async def gen():
        last_sent = -1
        while True:
            snap = AGGREGATOR.snapshot()
            slim = [{"mmsi": v["mmsi"], "n": v.get("ship_name"), "lat": v["latitude"], "lon": v["longitude"],
                     "cog": v.get("cog"), "sog": v.get("sog"), "hdg": v.get("heading"),
                     "f": v["freshness"][0], "last_seen": v.get("last_seen"),
                     "p": v.get("associated_port_id"), "pn": v.get("associated_port_name"),
                     "np": v.get("nearest_port_name"), "d": v.get("distance_to_port_km"),
                     "st": v["vessel_status"], "dst": v.get("ais_destination"),
                     "ns": v.get("nav_status"), "ts": v.get("timestamp"),
                     "src": v.get("source"), "srcs": v.get("sources", []),
                     "trk": v.get("track", [])} for v in snap]
            payload = {"ts": time.time(), "health": AGGREGATOR.health(), "vessels": slim}
            yield f"data: {json.dumps(payload)}\n\n"
            last_sent = len(slim)
            await asyncio.sleep(3)
    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
