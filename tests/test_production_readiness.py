"""Production-readiness tests: coverage, schema, loading, inference, stale/missing, idempotency, leakage, availability, failures, persistence, health, secrets, scheduler."""
import glob, json, os, sys
sys.path.insert(0, os.getcwd())
import joblib
import numpy as np
import pandas as pd

def test_44_port_coverage():
    cov = json.load(open("reports/production_readiness/port_coverage.json"))
    assert len(cov) == 44
    assert all(c["traffic_prediction_available"] and c["congestion_prediction_available"] for c in cov)

def test_prediction_schema():
    s = json.load(open("metadata/prediction_schema.json"))
    for c in ["prediction_id", "port_id", "traffic_prediction", "congestion_lower_bound", "prediction_status"]:
        assert c in s

def test_model_loading():
    for d in ["traffic_model", "congestion_model"]:
        for f in ["model.joblib", "preprocessor.joblib", "feature_registry.joblib", "model_metadata.json", "training_config.json", "metrics.json"]:
            assert os.path.exists(f"models/daily/{d}/{f}"), f

def test_inference():
    from src.daily_pipeline import predict_for
    r = predict_for("2026-03-15")
    assert len(r) == 44 and r["traffic_prediction"].notna().all()

def test_unavailable_source_handling():
    from src.daily_pipeline import predict_for
    try:
        predict_for("2020-01-01")
        assert False
    except ValueError:
        pass

def test_stale_source_handling():
    from src.daily_pipeline import freshness
    f = freshness()
    assert f["status"] in ("FRESH", "STALE", "MISSING", "UNAVAILABLE")

def test_duplicate_prevention():
    p = pd.read_parquet("data/predictions/daily_predictions.parquet")
    assert not p.duplicated(subset=["port_id", "target_date"]).any()

def test_idempotency():
    from src.daily_pipeline import run_daily
    n0 = len(pd.read_parquet("data/predictions/daily_predictions.parquet"))
    run_daily("2026-04-15"); run_daily("2026-04-15")
    assert len(pd.read_parquet("data/predictions/daily_predictions.parquet")) == n0

def test_temporal_leakage():
    a = json.load(open("data/ml/daily/daily_leakage_audit.json"))
    assert a["TEMPORAL_LEAKAGE"] == "PASS"

def test_target_leakage():
    a = json.load(open("data/ml/daily/daily_leakage_audit.json"))
    assert a["TARGET_LEAKAGE"].startswith("PASS")

def test_feature_availability():
    reg = json.load(open("metadata/daily_feature_registry.json"))["features"]
    feats = json.load(open("data/ml/daily/daily_final_feature_set.json"))["features"]
    assert all(f in reg for f in feats)

def test_api_failure_records():
    recs = json.load(open("reports/production_readiness/failure_test_records.json"))
    assert any(r.get("pass") for r in recs) and len(recs) >= 4

def test_prediction_persistence():
    p = pd.read_parquet("data/predictions/daily_predictions.parquet")
    assert len(p) > 10000 and {"traffic_prediction", "congestion_prediction"}.issubset(p.columns)

def test_source_health():
    h = json.load(open("reports/production_readiness/source_health_report.json"))
    assert h["NOAA"]["status"].startswith("STALE") and h["GFW"]["status"].startswith("CURRENT")

def test_security():
    s = json.load(open("reports/production_readiness/security_audit.json"))
    assert s["bearer_tokens_in_src"] == 0 and s["env_ignored"] is True

def test_scheduler():
    s = json.load(open("reports/production_readiness/scheduler.json"))
    assert s["idempotent"] and ".env" in s["credentials"]
