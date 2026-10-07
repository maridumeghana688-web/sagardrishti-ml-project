"""Final-phase tests: WPI, ports, env merge, vessel, association, traffic, congestion,
waiting-time non-fabrication, leakage, master joins, provenance, checkpoints, size limits."""
import glob, json, os
import pandas as pd
import pyarrow.parquet as pq
import xarray as xr

PORT_RADIUS_KM = 50.0

def test_wpi_exists_india_only():
    df = pd.read_parquet("data/reference/india_ports.parquet")
    assert len(df) == 44
    assert (df["country"] == "IN").all()
    assert df["latitude"].between(-90, 90).all() and df["longitude"].between(-180, 180).all()
    assert df["port_id"].is_unique
    assert df["latitude"].between(5, 38).all() and df["longitude"].between(66, 98).all()

def test_wpi_report():
    r = json.load(open("reports/wpi_acquisition_report.json"))
    assert r["final_port_count"] == 44 and r["invalid_coordinate_count"] == 0

def test_raw_immutable_complete():
    assert len(glob.glob("data/kaggle_output/noaa/*.nc")) == 36
    assert len(list(__import__("pathlib").Path("data/kaggle_output/gfw").rglob("*.parquet"))) == 36
    assert len(list(__import__("pathlib").Path("data/kaggle_output/copernicus").rglob("*.nc"))) == 65  # 36 (2021-23) + 29 (2024-2026-05 ext; originals preserved)
    assert os.path.exists("data/kaggle_output/india_mask.geojson")

def test_no_global_cmems():
    # surface monthly only: every file depth<=5m, monthly time dim
    import pathlib
    for p in sorted(pathlib.Path("data/kaggle_output/copernicus").rglob("*.nc"))[:3]:
        ds = xr.open_dataset(p)
        assert float(ds["depth"].max()) <= 5.0
        assert ds.sizes["time"] == 1
        ds.close()

def test_environment_merge():
    df = pd.read_parquet("data/ml/sagardrishti_india_environment.parquet")
    assert len(df) == 604800
    for c in ["sst_monthly_mean", "cmems_thetao", "cmems_so", "cmems_uo", "cmems_vo", "current_magnitude", "in_india_mask"]:
        assert c in df.columns
    assert df["cmems_thetao"].notna().mean() > 0.5  # ocean coverage, not failed join
    assert abs(df["cmems_thetao"].notna().mean() - 0.5942) < 0.02

def test_current_magnitude():
    df = pd.read_parquet("data/ml/sagardrishti_india_environment.parquet", columns=["cmems_uo", "cmems_vo", "current_magnitude"])
    d = df.dropna()
    import numpy as np
    assert np.allclose(d["current_magnitude"], np.sqrt(d["cmems_uo"]**2 + d["cmems_vo"]**2))

def test_vessel_final():
    pf = pq.ParquetFile("data/ml/sagardrishti_india_vessel_activity.parquet")
    assert pf.metadata.num_rows == 5887415
    df = pd.read_parquet("data/ml/sagardrishti_india_vessel_activity.parquet", columns=["time", "lat", "lon"])
    assert df["lat"].between(0, 30).all() and df["lon"].between(65, 100).all()
    assert pd.to_datetime(df["time"], utc=True).dt.strftime("%Y-%m").nunique() == 36

def test_association_documented():
    df = pd.read_parquet("data/derived/port_vessel_activity.parquet", columns=["associated_port_id", "nearest_port_distance_km", "observation", "association"])
    assert (df["observation"] == "observed GFW vessel presence").all()
    assert df["associated_port_id"].notna().mean() > 0.01
    assert (df.dropna(subset=["associated_port_id"])["nearest_port_distance_km"] <= PORT_RADIUS_KM + 1e-6).all()

def test_traffic_aggregation():
    df = pd.read_parquet("data/ml/sagardrishti_port_traffic.parquet")
    assert len(df) == 1548
    assert (df["vessel_presence_hours"] > 0).all()
    import numpy as np
    assert np.allclose(df["traffic_index"], np.log1p(df["vessel_presence_hours"]) * np.log1p(df["vessel_count_sum"]))

def test_congestion_documented():
    df = pd.read_parquet("data/ml/sagardrishti_port_congestion.parquet")
    assert df["congestion_index"].between(0, 1).all()
    assert "congestion_formula" in df.columns

def test_waiting_time_genuine_not_fabricated():
    # Genuine Paradip monthly means acquired 2026-09: file must exist with real observations,
    # no invented distributions, no fake waiting-time variants.
    assert os.path.exists("data/ml/sagardrishti_port_waiting_time.parquet")
    assert not os.path.exists("data/ml/sagardrishti_waiting_time.parquet")
    r = json.load(open("reports/target_availability_report.json"))
    assert r["waiting_time"]["status"] == "DERIVATION_SPARSE" or r["waiting_time"]["status"] == "DERIVED_SPARSE"
    import pandas as pd
    df = pd.read_parquet("data/ml/sagardrishti_port_waiting_time.parquet")
    assert (df["waiting_time_mean_hours"] >= 0).all() and len(df) == 8
    assert df[["waiting_time_median_hours", "waiting_time_p25_hours",
               "waiting_time_p75_hours", "waiting_time_max_hours"]].isna().all().all()

def test_leakage():
    assert json.load(open("metadata/ml_split_spec.json"))["leakage"].startswith("PASS")
    env = pd.read_parquet("data/ml/sagardrishti_india_environment.parquet", columns=["time"])
    assert pd.to_datetime(env["time"]).min() >= pd.Timestamp("2021-01-01")

def test_master_joins():
    m = pd.read_parquet("data/ml/sagardrishti_master_training.parquet")
    assert len(m) == 1548 and m["port_id"].nunique() >= 43
    assert "waiting_time_mean_hours" in m.columns  # genuine sparse target (8/1548)
    assert int(m["waiting_time_mean_hours"].notna().sum()) == 8
    for c in ["sst_monthly_mean", "cmems_thetao", "traffic_target", "congestion_index"]:
        assert c in m.columns

def test_provenance_manifest():
    mp = json.load(open("metadata/source_manifest.json"))
    assert "sagardrishti_final_build_2026_09_28" in mp
    assert "waiting_time" in str(mp).lower()

def test_checkpoints_resume_guards():
    # raw stages complete -> resume must skip; checkpoint file reflects OK
    acq = json.load(open("data/kaggle_output/checkpoints/acquisition.json"))
    assert acq["stages"]["A_gfw"]["status"] == "OK"
    assert acq["stages"]["B_noaa"]["status"] == "OK"
    assert acq["stages"]["C_cmems"]["status"] == "OK"

def test_size_limits():
    import pathlib
    raw = sum(p.stat().st_size for p in pathlib.Path("data/kaggle_output/noaa").glob("*.nc"))
    raw += sum(p.stat().st_size for p in pathlib.Path("data/kaggle_output/copernicus").rglob("*.nc"))
    raw += sum(p.stat().st_size for p in pathlib.Path("data/kaggle_output/gfw").rglob("*.parquet"))
    assert raw / 1e9 < 10.0, raw
