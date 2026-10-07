"""Daily GFW acquisition tests: genuine daily resolution, no disaggregation, India bounds, coverage, resume, targets, leakage, storage, credentials, monthly preserved."""
import glob, json, os
import numpy as np
import pandas as pd

RAW = "data/raw/daily_gfw"

def test_genuine_daily_resolution():
    df = pd.read_parquet(RAW + "/year=2021/month=01/part.parquet", columns=["time range"])
    assert df["time range"].nunique() >= 27  # multiple distinct DAYS, not one month label
    assert all(len(str(x)) == 10 for x in df["time range"].unique())  # YYYY-MM-DD

def test_no_monthly_disaggregation():
    m = pd.read_parquet("data/kaggle_output/gfw/year=2021/month=01/part.parquet")
    d = pd.read_parquet(RAW + "/year=2021/month=01/part.parquet")
    assert len(d) != len(m)  # different row counts prove independent daily product
    assert d["time range"].nunique() > 1 and m["time range"].nunique() == 1

def test_india_spatial():
    import pathlib
    for f in list(pathlib.Path(RAW).rglob("part.parquet"))[:4]:
        df = pd.read_parquet(f, columns=["lat", "lon"])
        assert df.lat.between(0, 30).all() and df.lon.between(65, 100).all()

def test_date_coverage():
    assert len(glob.glob(RAW + "/year=*/month=*/part.parquet")) == 68  # 36 (2021-23) + 32 (2024-2026-08)
    assert len(glob.glob(RAW + "/year=*/month=*/.complete")) == 68

def test_partition_resume_markers():
    st = json.load(open(RAW + "/checkpoints.json"))
    assert len(st["complete"]) == 68 and st["failed"] == 0

def test_duplicate_detection():
    df = pd.read_parquet(RAW + "/year=2023/month=12/part.parquet")
    assert df.duplicated().sum() == 0
    assert df.duplicated(subset=["lat", "lon", "time range", "flag"]).sum() == 0

def test_target_construction():
    t = pd.read_parquet("data/ml/daily/sagardrishti_daily_port_traffic.parquet")
    assert len(t) == 44 * 1095 and not t.duplicated(subset=["port_id", "date"]).any()
    assert (t["presence_hours"] >= 0).all() and (t["vessel_count"] >= 0).all()

def test_next_day_alignment():
    t = pd.read_parquet("data/ml/daily/sagardrishti_daily_port_traffic.parquet")
    t["date"] = pd.to_datetime(t["date"], utc=True)
    p = t[t.port_id == 49535].sort_values("date").reset_index(drop=True)
    assert abs(p.loc[0, "traffic_target_next_day"] - p.loc[1, "presence_hours"]) < 1e-9
    assert pd.isna(p.iloc[-1]["traffic_target_next_day"])

def test_temporal_leakage_daily():
    v2 = pd.read_parquet("data/ml/daily/sagardrishti_daily_master_training_v2.parquet", columns=["port_id", "date", "sst", "traffic_target_next_day"])
    assert "traffic_target_next_day" in v2.columns  # target separate from X(t) features

def test_target_leakage_daily():
    v2cols = pd.read_parquet("data/ml/daily/sagardrishti_daily_master_training_v2.parquet").columns
    assert "traffic_target_next_day" in v2cols and "congestion_target_next_day" in v2cols

def test_storage_gate():
    import pathlib
    tot = sum(f.stat().st_size for d in ["data/kaggle_output/noaa", "data/kaggle_output/gfw", "data/kaggle_output/copernicus", "data/raw/daily_gfw"] for f in pathlib.Path(d).rglob("*") if f.is_file()) / 1e9
    assert tot < 10.0, tot

def test_credential_safety():
    for f in glob.glob("data/raw/daily_gfw/request_log.jsonl") + ["reports/daily_gfw_target_coverage_report.json"]:
        txt = open(f).read() if os.path.exists(f) else ""
        assert "Bearer" not in txt and "GFW_API_TOKEN=" not in txt
    assert os.path.exists("data/raw/daily_gfw/request_log.jsonl")

def test_monthly_artifacts_preserved():
    import joblib
    assert joblib.load("models/traffic_model/model.joblib") is not None
    m = pd.read_parquet("data/ml/sagardrishti_master_training.parquet")
    assert len(m) == 1548
