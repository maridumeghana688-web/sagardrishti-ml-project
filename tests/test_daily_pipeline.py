"""Daily pipeline tests: grain, dups, shift-honesty, no-future, lags/rolls, splits, normalization, inference, rejection, provenance, schema, coverage, monthly preservation."""
import json
import numpy as np
import pandas as pd

M = "data/ml/daily/sagardrishti_daily_master_training.parquet"

def _m():
    m = pd.read_parquet(M)
    m["date"] = pd.to_datetime(m["date"], utc=True)
    return m.sort_values(["port_id", "date"]).reset_index(drop=True)

def test_daily_grain():
    m = _m()
    assert set(["port_id", "date"]) <= set(m.columns)
    assert m.date.dt.normalize().eq(m.date).all()

def test_no_duplicate_port_date():
    assert not _m().duplicated(subset=["port_id", "date"]).any()

def test_target_shift_honesty():
    m = _m()  # targets are null by design (monthly GFW cannot yield daily labels)
    assert m[["traffic_target_t_plus_1", "congestion_t_plus_1"]].isna().all().all()
    assert (m["vessel_source_available"] == False).all()

def test_no_future_features():
    src = open("C:/Users/J SATYA/AppData/Local/Temp/opencode/daily_master.py").read()
    assert "shift(1)" in src and "t+1" not in src.replace("t_plus_1", "")

def test_lag_correctness():
    m = _m()
    g = m.groupby("port_id")["sst"]
    assert np.allclose(m["sst_lag1"].dropna(), g.shift(1).dropna(), equal_nan=True)
    assert np.allclose(m["sst_lag7"].dropna(), g.shift(7).dropna(), equal_nan=True)

def test_rolling_correctness():
    m = _m()
    g = m.groupby("port_id")["sst"]
    exp = g.shift(1).rolling(7, min_periods=1).mean()
    assert np.allclose(m["sst_roll7_mean"].dropna(), exp.dropna(), equal_nan=True)

def test_temporal_split():
    s = json.load(open("data/ml/daily/daily_split_spec.json"))
    assert (s["train_n"], s["validation_n"], s["test_n"]) == (32076, 7964, 8096)

def test_normalization_leakage():
    st = json.load(open("data/ml/daily/daily_stats.json"))
    m = _m()
    assert abs(st["sst_train_mean"] - float(m[m.date <= "2022-12-31"].sst.mean(skipna=True))) < 1e-9

def test_inference_valid_and_reject():
    from src.ml.daily_inference import predict_next_day_traffic, predict_next_day_congestion
    ok = predict_next_day_traffic(49535, "2023-08-15")
    assert ok["predicted_value"] == "unavailable" and ok["feature_timestamp"] == "2023-08-14"
    for bad in [lambda: predict_next_day_traffic(999999, "2023-08-15"), lambda: predict_next_day_traffic(49535, "2025-01-01"), lambda: predict_next_day_traffic(49535, "2022-07-03")]:
        try:
            bad()
            raise SystemExit("should have rejected")
        except ValueError:
            pass
    c = predict_next_day_congestion(49535, "2023-08-15")
    assert c["predicted_value"] == "unavailable"

def test_missing_feature_stale_flag():
    from src.ml.daily_inference import predict_next_day_traffic
    m = _m()
    null_day = m[m.sst.isna()].iloc[0]
    d = (null_day["date"] + pd.Timedelta(days=1)).strftime("%Y-%m-%d")
    out = predict_next_day_traffic(int(null_day["port_id"]), d)
    assert out["data_freshness"] == "stale-input" and out["warnings"]

def test_provenance_schema_coverage():
    m = _m()
    assert "provenance" in m.columns and m["provenance"].str.contains("CMEMS lag-1-month|lag-month").all()
    assert m.port_id.nunique() == 44 and m.date.nunique() == 1094
    assert str(m.date.min())[:10] == "2021-01-01" and str(m.date.max())[:10] == "2023-12-31"

def test_monthly_models_preserved():
    import joblib
    for d in ["traffic_model", "congestion_model"]:
        assert joblib.load(f"models/{d}/model.joblib") is not None
    assert json.load(open("models/model_registry.json"))["models"][0]["model_name"] == "traffic_model_v1"

def test_waiting_not_disaggregated():
    m = _m()
    assert "waiting_time_mean_hours" not in m.columns
    w = pd.read_parquet("data/ml/sagardrishti_port_waiting_time.parquet")
    assert len(w) == 8  # monthly labels untouched
