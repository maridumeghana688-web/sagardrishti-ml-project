"""SAGARDRISHTI ML inference (traffic + congestion; waiting unavailable). No model training here."""
from __future__ import annotations
import json
import joblib
import pandas as pd

_REG = "models/model_registry.json"
_FEATS = "data/ml/experiments/baseline_feature_set.json"

def _load(name: str):
    return joblib.load(f"models/{name}/model.joblib")

def _features() -> list:
    return json.load(open(_FEATS))["features"]

def predict(port_id: int, month: str, features: dict) -> dict:
    """features: dict of feature_name -> value (missing allowed; train-median imputed).
    month: 'YYYY-MM' (informational; lag/rolling values must be supplied by caller from past months)."""
    feats = _features()
    row = {c: features.get(c) for c in feats}
    X = pd.DataFrame([row])
    out = {"port_id": port_id, "month": month,
           "predicted_port_traffic": float(_load("traffic_model").predict(X)[0]),
           "predicted_congestion": float(_load("congestion_model").predict(X)[0]),
           "waiting_time_prediction": "unavailable",
           "waiting_time_reason": "EXPERIMENTAL_INSUFFICIENT_LABELS (8 Paradip labels; no valid supervised model)"}
    return out

def batch_predict(df: pd.DataFrame) -> pd.DataFrame:
    feats = _features()
    X = df.reindex(columns=feats)
    d = df[["port_id"]].copy() if "port_id" in df.columns else pd.DataFrame(index=df.index)
    d["predicted_port_traffic"] = _load("traffic_model").predict(X)
    d["predicted_congestion"] = _load("congestion_model").predict(X)
    d["waiting_time_prediction"] = "unavailable"
    return d
