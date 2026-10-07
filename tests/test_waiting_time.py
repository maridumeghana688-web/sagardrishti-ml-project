"""Waiting-time tests: genuineness, QC, merge, leakage, preservation."""
import glob, json, os
import pandas as pd
import pyarrow.parquet as pq

W = "data/ml/sagardrishti_port_waiting_time.parquet"
M = "data/ml/sagardrishti_master_training.parquet"

def test_waiting_exists_schema():
    df = pd.read_parquet(W)
    for c in ["port_id", "port_name", "unlocode", "month", "vessel_count", "valid_waiting_events",
              "waiting_time_mean_hours", "waiting_time_median_hours", "waiting_time_p25_hours",
              "waiting_time_p75_hours", "waiting_time_max_hours", "source", "method",
              "coverage_start", "coverage_end"]:
        assert c in df.columns, c
    assert len(df) == 8

def test_waiting_genuine_values():
    df = pd.read_parquet(W)
    assert (df["waiting_time_mean_hours"] >= 0).all()
    assert (df["waiting_time_mean_hours"] < 500).all()
    assert df["port_id"].eq(49535).all() and (df["port_name"] == "PARADIP").all()
    assert df["month"].is_unique and list(df["month"]) == sorted(df["month"])
    assert (df["vessel_count"] > 0).all() and (df["valid_waiting_events"] == df["vessel_count"]).all()
    # distributions honestly absent, not fabricated
    assert df[["waiting_time_median_hours", "waiting_time_p25_hours", "waiting_time_p75_hours", "waiting_time_max_hours"]].isna().all().all()
    # unlocode not invented
    assert df["unlocode"].isna().all()

def test_waiting_weighted_check():
    df = pd.read_parquet(W)
    for _, r in df.iterrows():
        d = json.loads(r["by_type_detail"])
        tot_v = sum(v["vessels"] for v in d.values())
        assert tot_v == r["vessel_count"]
        wtd = sum(v["vessels"] * v["pbwt_h"] for v in d.values()) / tot_v
        assert abs(wtd - r["waiting_time_mean_hours"]) < 0.06

def test_waiting_no_neg_dup():
    df = pd.read_parquet(W)
    assert not df.duplicated().any()
    assert (df["waiting_time_mean_hours"] >= 0).all()

def test_master_merge_same_month():
    m = pd.read_parquet(M)
    assert "waiting_time_mean_hours" in m.columns
    hit = m[m["waiting_time_mean_hours"].notna()]
    assert len(hit) == 8
    assert set(hit["port_id"].unique()) == {49535}
    months = pd.to_datetime(hit["time"], utc=True).dt.strftime("%Y-%m")
    assert set(months) == set(pd.read_parquet(W)["month"])

def test_master_leakage():
    m = pd.read_parquet(M)
    feats = [c for c in m.columns if "waiting" not in c.lower()]
    assert "waiting_time_mean_hours" not in feats
    assert len(feats) == 34

def test_existing_preserved():
    assert len(glob.glob("data/kaggle_output/noaa/*.nc")) == 36
    import pathlib
    assert len(list(pathlib.Path("data/kaggle_output/gfw").rglob("*.parquet"))) == 36
    assert len(list(pathlib.Path("data/kaggle_output/copernicus").rglob("*.nc"))) == 65  # 36 + 29 extension; originals preserved
    for p in ["data/ml/sagardrishti_india_environment.parquet",
              "data/ml/sagardrishti_india_vessel_activity.parquet",
              "data/ml/sagardrishti_port_traffic.parquet",
              "data/ml/sagardrishti_port_congestion.parquet"]:
        assert os.path.exists(p)

def test_reports_updated():
    avail = json.load(open("reports/target_availability_report.json"))
    assert avail["waiting_time"]["status"] == "DERIVED_SPARSE"
    assert os.path.exists("reports/waiting_time_source_failure_report.json")
    spec = json.load(open("metadata/ml_split_spec.json"))
    assert "waiting_time" in spec["targets"]
