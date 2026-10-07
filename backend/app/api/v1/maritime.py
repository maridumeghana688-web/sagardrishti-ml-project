"""Maritime ML API: ports, predictions, environment, vessel activity, analytics, sources.

Serves real artifacts only (parquet datasets + joblib daily models). No secrets loaded,
none returned. Read-only wrt source datasets.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

import joblib
import pandas as pd
from fastapi import APIRouter, HTTPException, Query

router = APIRouter(tags=["maritime"])

ROOT = Path(__file__).resolve().parents[4]
DATA = ROOT / "data"
MODELS = ROOT / "models"


@lru_cache(maxsize=1)
def _ports() -> pd.DataFrame:
    return pd.read_parquet(DATA / "reference" / "india_ports.parquet")


@lru_cache(maxsize=1)
def _master() -> pd.DataFrame:
    m = pd.read_parquet(DATA / "ml" / "daily" / "sagardrishti_daily_master_training_final.parquet")
    m["date"] = pd.to_datetime(m["date"], utc=True)
    return m


@lru_cache(maxsize=1)
def _predictions() -> pd.DataFrame:
    p = pd.read_parquet(DATA / "predictions" / "daily_predictions.parquet")
    return p


@lru_cache(maxsize=1)
def _models() -> dict:
    return {
        "traffic": joblib.load(MODELS / "daily" / "traffic_model" / "model.joblib"),
        "congestion": joblib.load(MODELS / "daily" / "congestion_model" / "model.joblib"),
    }


@lru_cache(maxsize=1)
def _model_meta() -> dict:
    out = {}
    for k, d in (("traffic", "traffic_model"), ("congestion", "congestion_model")):
        out[k] = json.load(open(MODELS / "daily" / d / "model_metadata.json"))
    return out


@lru_cache(maxsize=1)
def _feats() -> list:
    return json.load(open(DATA / "ml" / "daily" / "daily_final_feature_set.json"))["features"]


def _port_or_404(port_id: int) -> dict:
    df = _ports()
    row = df[df["port_id"].astype(int) == int(port_id)]
    if row.empty:
        raise HTTPException(status_code=404, detail=f"Unknown port_id {port_id}")
    r = row.iloc[0]
    return {"id": int(r["port_id"]), "name": str(r["port_name"]), "latitude": float(r["latitude"]),
            "longitude": float(r["longitude"]), "harbor_size": str(r.get("harbor_size", "")),
            "harbor_type": str(r.get("harbor_type", ""))}


def _freshness() -> dict:
    m = _master()
    latest = m["date"].max()
    age = (pd.Timestamp.now(tz="UTC").normalize() - latest).days
    return {"gfw": "CURRENT", "gfw_latest": "2026-08-31",
            "cmems": "CURRENT", "cmems_latest": "2026-05 (monthly)",
            "noaa": "HISTORICAL", "noaa_latest": "2023-12-31 (product ended)",
            "wpi": "REFERENCE",
            "local_latest_date": str(latest.date()), "data_age_days": int(age),
            "status": "STALE" if age > 45 else "FRESH"}


@router.get("/sources/status")
def sources_status():
    p = _predictions()
    return {"sources": _freshness(), "models": {k: v["model_name"] for k, v in _model_meta().items()},
            "latest_prediction_date": str(p["target_date"].max()), "ports_with_predictions": int(p["port_id"].nunique())}


@router.get("/ports")
def list_ports():
    df = _ports()
    return {"count": int(len(df)), "ports": [
        {"id": int(r.port_id), "name": str(r.port_name), "latitude": float(r.latitude), "longitude": float(r.longitude)}
        for r in df.itertuples()]}


@router.get("/ports/{port_id}")
def port_detail(port_id: int):
    return {"port": _port_or_404(port_id), "freshness": _freshness()}


def _prediction_row(port_id: int, target_date: str | None) -> dict:
    p = _predictions()
    g = p[p["port_id"].astype(int) == int(port_id)]
    if g.empty:
        raise HTTPException(status_code=404, detail="No predictions for port")
    row = g.sort_values("target_date").iloc[-1] if target_date is None else g[g["target_date"] == target_date]
    if row.empty if isinstance(row, pd.DataFrame) else False:
        raise HTTPException(status_code=404, detail=f"No prediction for date {target_date}")
    r = row.iloc[0] if isinstance(row, pd.DataFrame) else row
    return {"date": str(r["target_date"]), "traffic": float(r["traffic_prediction"]),
            "traffic_lower": float(r["traffic_lower"]), "traffic_upper": float(r["traffic_upper"]),
            "congestion": float(r["congestion_prediction"]), "congestion_lower": float(r["congestion_lower"]),
            "congestion_upper": float(r["congestion_upper"])}


@router.get("/predictions/{port_id}")
def port_prediction(port_id: int, date: str | None = Query(default=None)):
    port = _port_or_404(port_id)
    pred = _prediction_row(port_id, date)
    meta = _model_meta()
    return {"port": port, "prediction": pred,
            "model": {"traffic_version": meta["traffic"]["model_name"], "congestion_version": meta["congestion"]["model_name"],
                      "traffic_trained_at": meta["traffic"].get("training_timestamp"),
                      "congestion_trained_at": meta["congestion"].get("training_timestamp"),
                      "training_period": meta["traffic"].get("training_period"),
                      "source_dataset": "data/predictions/daily_predictions.parquet"},
            "data_status": _freshness(), "waiting_time": "NO RECENT READING (8 monthly Paradip labels only; no daily model)"}


@router.get("/predictions")
def predictions_by_date(date: str = Query(description="target date YYYY-MM-DD")):
    p = _predictions()
    g = p[p["target_date"] == date]
    if g.empty:
        raise HTTPException(status_code=404, detail=f"No predictions for date {date}")
    ports = {int(r.port_id): {"id": int(r.port_id), "name": str(r.port_name)} for r in _ports().itertuples()}
    out = []
    for r in g.itertuples():
        info = ports.get(int(r.port_id), {"id": int(r.port_id), "name": ""})
        out.append({"port": info, "prediction": {"date": str(r.target_date), "traffic": float(r.traffic_prediction),
                    "traffic_lower": float(r.traffic_lower), "traffic_upper": float(r.traffic_upper),
                    "congestion": float(r.congestion_prediction), "congestion_lower": float(r.congestion_lower),
                    "congestion_upper": float(r.congestion_upper)}})
    return {"date": date, "count": len(out), "predictions": out, "data_status": _freshness()}


@router.get("/environment/{port_id}")
def port_environment(port_id: int, days: int = Query(default=30, le=120)):
    _port_or_404(port_id)
    m = _master()
    g = m[m["port_id"].astype(int) == int(port_id)].sort_values("date").tail(days)
    pts = [{"date": str(r.date.date()),
            "sst": None if pd.isna(r.sst) else round(float(r.sst), 2),
            "salinity": None if pd.isna(r.cmems_so) else round(float(r.cmems_so), 2),
            "current_magnitude": None if pd.isna(r.current_magnitude) else round(float(r.current_magnitude), 3)}
           for r in g.itertuples()]
    return {"port_id": int(port_id), "points": pts,
            "note": "SST null from 2024 (product ended 2023); CMEMS monthly lag-1-month"}


@router.get("/vessel-activity/{port_id}")
def port_vessel_activity(port_id: int, days: int = Query(default=30, le=120)):
    _port_or_404(port_id)
    m = _master()
    g = m[m["port_id"].astype(int) == int(port_id)].sort_values("date").tail(days)
    pts = [{"date": str(r.date.date()), "activity_count": int(r.activity_count or 0),
            "presence_hours": round(float(r.presence_hours or 0), 1)} for r in g.itertuples()]
    return {"port_id": int(port_id), "points": pts, "note": "GFW daily observed (absent day = observed zero)"}


@router.get("/explainability/global")
def explainability_global():
    """Model-level global importance (associational, NOT per-prediction SHAP)."""
    with open(ROOT / "reports" / "daily_feature_importance" / "global_importance.json") as f:
        data = json.load(f)
    return {"level": "MODEL-LEVEL GLOBAL IMPORTANCE (associational, not causal; not per-prediction)",
            "targets": data}


@router.get("/analytics/{port_id}")
def port_analytics(port_id: int):
    _port_or_404(port_id)
    m = _master()
    g = m[m["port_id"].astype(int) == int(port_id)].sort_values("date")
    hist = [{"date": str(r.date.date()), "traffic": round(float(r.presence_hours or 0), 1),
             "congestion": None if pd.isna(r.gfw_derived_daily_congestion_proxy) else round(float(r.gfw_derived_daily_congestion_proxy), 4)}
            for r in g.tail(90).itertuples()]
    return {"port_id": int(port_id), "history": hist,
            "trend_30d": {"traffic_mean": round(float(g.tail(30)["presence_hours"].mean() or 0), 1)}}
