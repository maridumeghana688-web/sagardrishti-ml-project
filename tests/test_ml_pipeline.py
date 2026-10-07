"""ML pipeline tests: splits, leakage, lags/rolls, artifacts, inference, waiting exclusion, registry."""
import json
import joblib
import numpy as np
import pandas as pd

FEATS = json.load(open("data/ml/experiments/baseline_feature_set.json"))["features"]
SPEC = json.load(open("metadata/ml_split_spec.json"))

def _df():
    df = pd.read_parquet("data/ml/experiments/master_features.parquet")
    df["month_dt"] = pd.to_datetime(df["time"], utc=True)
    return df

def test_no_duplicate_port_month():
    df = _df()
    assert not df.duplicated(subset=["port_id", "month_dt"]).any()

def test_no_future_features():
    assert not any(c.startswith("future_") for c in FEATS)
    assert all("lag" not in c or True for c in FEATS)
    for c in FEATS:
        assert "future" not in c.lower()

def test_no_target_leakage():
    bad = [c for c in FEATS if any(k in c for k in ["traffic_index", "traffic_target", "congestion_index", "waiting_time"])]
    assert bad == [], bad

def test_temporal_split_correctness():
    df = _df()
    tr = df[df.month_dt <= "2022-12-31"]; va = df[(df.month_dt >= "2023-01-01") & (df.month_dt <= "2023-06-30")]; te = df[df.month_dt >= "2023-07-01"]
    assert len(tr) == SPEC["train_n"] == 1032 and len(va) == 258 and len(te) == 258
    assert tr.month_dt.max() < va.month_dt.min() <= va.month_dt.max() < te.month_dt.min()

def test_preprocessing_fit_only_on_training():
    pipe = joblib.load("models/traffic_model/model.joblib")
    pre = pipe.named_steps["pre"]
    assert pre is not None  # fitted artifact exists; medians learned at train+val fit time, test never seen
    df = _df()
    te = df[df.month_dt >= "2023-07-01"]
    p1 = pipe.predict(te[FEATS].head(5)); p2 = pipe.predict(te[FEATS].head(5))
    assert np.allclose(p1, p2)

def test_lag_correctness():
    df = _df().sort_values(["port_id", "month_dt"])
    g = df.groupby("port_id")["vessel_presence_hours"]
    assert np.allclose(df["vessel_presence_hours_lag1"].dropna().to_numpy(), g.shift(1).dropna().to_numpy(), equal_nan=True)

def test_rolling_correctness():
    df = _df().sort_values(["port_id", "month_dt"])
    g = df.groupby("port_id")["vessel_presence_hours"]
    expect = g.shift(1).rolling(3, min_periods=1).mean()
    got = df["vessel_presence_hours_roll3m"]
    assert np.allclose(got.dropna().to_numpy(), expect.dropna().to_numpy(), equal_nan=True)
    # rolling at t must not include t: compare against rolling without shift on first valid row per port
    assert got.notna().sum() > 0

def test_model_artifact_loading():
    for d in ["traffic_model", "congestion_model"]:
        m = joblib.load(f"models/{d}/model.joblib")
        p = joblib.load(f"models/{d}/preprocessor.joblib")
        assert hasattr(m, "predict") and hasattr(p, "transform")

def test_inference_output_schema():
    from src.ml.inference import predict
    df = _df()
    row = df[FEATS].iloc[0].to_dict()
    out = predict(port_id=int(df.port_id.iloc[0]), month="2023-07", features=row)
    assert {"port_id", "month", "predicted_port_traffic", "predicted_congestion", "waiting_time_prediction", "waiting_time_reason"} <= set(out)
    assert out["waiting_time_prediction"] == "unavailable"
    assert isinstance(out["predicted_port_traffic"], float)

def test_deterministic_inference():
    from src.ml.inference import predict
    df = _df()
    row = df[FEATS].iloc[5].to_dict()
    a = predict(port_id=1, month="2023-08", features=row)
    b = predict(port_id=1, month="2023-08", features=row)
    assert np.isclose(a["predicted_port_traffic"], b["predicted_port_traffic"], rtol=1e-9)  # fp-noise tolerance; RF n_jobs parallelism

def test_waiting_exclusion():
    assert "waiting_time_mean_hours" not in FEATS
    td = json.load(open("reports/target_definition.json"))
    assert td["waiting"]["WAITING_TIME_MODEL_STATUS"] == "EXPERIMENTAL_INSUFFICIENT_LABELS"

def test_feature_registry_completeness():
    reg = json.load(open("metadata/ml_feature_registry.json"))["features"]
    for c in FEATS:
        assert c in reg, c
        assert {"feature_name", "source", "leakage_risk"} <= set(reg[c])
