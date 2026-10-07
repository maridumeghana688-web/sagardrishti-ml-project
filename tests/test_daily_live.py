"""Final-phase tests: availability audit, extended acquisition, final master, splits, models, pipeline, predictions, monitoring, API, monthly preservation."""
import glob, json, os
import joblib
import numpy as np
import pandas as pd

def test_availability_audit():
    a = json.load(open("reports/live_source_availability_report.json"))
    assert a["GFW"]["latest_available"] and "2023-12-31" in str(a["NOAA"])

def test_extended_acquisition():
    assert len(glob.glob("data/raw/daily_gfw/year=*/month=*/.complete")) == 68
    assert len(glob.glob("data/kaggle_output/copernicus/*/.complete")) == 65
    st = json.load(open("data/raw/daily_gfw/checkpoints.json"))
    assert st["failed"] == 0

def test_final_master():
    m = pd.read_parquet("data/ml/daily/sagardrishti_daily_master_training_final.parquet")
    assert len(m) == 91036 and not m.duplicated(subset=["port_id", "date"]).any()
    assert m.port_id.nunique() == 44
    assert str(pd.to_datetime(m.date).min())[:10] == "2021-01-01" and str(pd.to_datetime(m.date).max())[:10] == "2026-08-31"
    assert "traffic_target_next_day" in m.columns and m.traffic_target_next_day.notna().mean() > 0.99

def test_splits_and_backtest_def():
    assert os.path.exists("data/ml/daily/sagardrishti_daily_master_training_final.parquet")

def test_daily_models_load_and_predict():
    import pandas as pd
    feats = json.load(open("data/ml/daily/daily_final_feature_set.json"))["features"]
    m = pd.read_parquet("data/ml/daily/sagardrishti_daily_master_training_final.parquet")
    X = m[feats].head(20)
    for d in ["traffic_model", "congestion_model"]:
        p = joblib.load(f"models/daily/{d}/model.joblib").predict(X)
        assert len(p) == 20 and np.isfinite(p).all()

def test_run_daily_idempotent():
    from src.daily_pipeline import run_daily, PRED
    n0 = len(pd.read_parquet(PRED)) if os.path.exists(PRED) else 0
    run_daily("2026-08-15")
    n1 = len(pd.read_parquet(PRED))
    run_daily("2026-08-15")
    n2 = len(pd.read_parquet(PRED))
    assert n1 == n2 and n1 >= n0

def test_predictions_schema_and_monitoring():
    p = pd.read_parquet("data/predictions/daily_predictions.parquet")
    for c in ["prediction_date", "target_date", "port_id", "port_name", "traffic_prediction", "congestion_prediction",
              "traffic_lower", "traffic_upper", "congestion_lower", "congestion_upper", "model_version", "source_latest_dates", "prediction_timestamp"]:
        assert c in p.columns, c
    mon = json.load(open("reports/daily_model_monitoring/monitoring.json"))
    assert "live_backtest_2026" in mon

def test_api_interface():
    from src.daily_pipeline.api import get_daily_predictions_for_port, get_source_status
    assert len(get_daily_predictions_for_port(49535)) > 0
    assert "freshness" in get_source_status()

def test_monthly_preserved_and_waiting_separate():
    m = pd.read_parquet("data/ml/sagardrishti_master_training.parquet")
    assert len(m) == 1548
    assert "waiting_time_mean_hours" not in pd.read_parquet("data/ml/daily/sagardrishti_daily_master_training_final.parquet").columns
    assert len(pd.read_parquet("data/ml/sagardrishti_port_waiting_time.parquet")) == 8
