"""Daily inference: validates inputs, assembles X(t) daily features, honest unavailable predictions."""
from __future__ import annotations
import json
import pandas as pd

ENV = "data/ml/daily/sagardrishti_daily_environment.parquet"
PORTS = "data/reference/india_ports.parquet"
SPEC = "data/ml/daily/daily_split_spec.json"

def _ports():
    return pd.read_parquet(PORTS)

def _check(port_id: int, prediction_date: str):
    p = _ports()
    if int(port_id) not in set(p["port_id"].astype(int)):
        raise ValueError(f"unknown port_id {port_id}")
    d = pd.to_datetime(prediction_date, utc=True)
    if d.tzinfo is None:
        d = d.tz_localize("UTC")
    if not (pd.Timestamp("2021-01-01", tz="UTC") <= d <= pd.Timestamp("2023-12-31", tz="UTC")):
        raise ValueError(f"date {prediction_date} outside supported range 2021-2023")
    for c in ["sst"]:
        pass
    return d

def _features_for(port_id: int, d: pd.Timestamp) -> dict:
    m = pd.read_parquet("data/ml/daily/sagardrishti_daily_master_training.parquet",
                        filters=[("port_id", "==", int(port_id))])
    m["date"] = pd.to_datetime(m["date"], utc=True)
    row = m[m.date == d.normalize()]
    if row.empty:
        raise ValueError(f"no daily observation for port {port_id} on {d.date()} (e.g., 2022-07-02 source gap)")
    r = row.iloc[0]
    if pd.isna(r["sst"]) and r.isna().mean() > 0.9:
        stale = True
    else:
        stale = bool(pd.isna(r["sst"]))
    return r.to_dict(), stale

def predict_next_day_traffic(port_id: int, prediction_date: str) -> dict:
    """prediction_date D+1: features assembled from <= D. Daily model unavailable (no genuine daily targets)."""
    d = _check(port_id, prediction_date)
    feat_date = (d - pd.Timedelta(days=1)).normalize()
    feats, stale = _features_for(int(port_id), feat_date)
    return {"port": int(port_id), "prediction_date": str(d.date()), "feature_timestamp": str(feat_date.date()),
            "data_freshness": "stale-input" if stale else "fresh",
            "predicted_value": "unavailable", "model_version": "none",
            "reason": "DAILY_MODEL_NOT_TRAINED: GFW source is monthly aggregates; daily labels would be fabricated",
            "monthly_baseline": "models/traffic_model/ (port-month grain, preserved)",
            "warnings": ["input SST null (cloud gap)" ] if stale else []}

def predict_next_day_congestion(port_id: int, prediction_date: str) -> dict:
    r = predict_next_day_traffic(port_id, prediction_date)
    r["monthly_baseline"] = "models/congestion_model/ (port-month grain, preserved)"
    return r
