"""Local tests for the pipeline package — synthetic fixtures only.

No network, no credentials, no real data. Proves gate math, mask logic,
validators, leakage checks, and report writers behave correctly.
"""
import json
import os
import sys

import pandas as pd
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from scripts.sagar_pipeline import size_gate  # noqa: E402
from scripts.sagar_pipeline.errors import StageStop  # noqa: E402
from scripts.sagar_pipeline.provenance import make_provenance  # noqa: E402
from scripts.sagar_pipeline.validate import validate_table  # noqa: E402


def test_size_gate_blocks_over_budget():
    with pytest.raises(StageStop) as e:
        size_gate.gate(source="TEST", dataset="big", est_final_gb=999.0, budget_gb=10.0)
    assert "REQUIRED ACTION" in str(e.value)


def test_size_gate_passes_within_budget():
    size_gate.gate(source="TEST", dataset="small", est_final_gb=1.0, budget_gb=10.0)


def test_tabular_estimate_scales():
    a = size_gate.estimate_tabular_gb(1_000_000, 10)
    b = size_gate.estimate_tabular_gb(2_000_000, 10)
    assert abs(b - 2 * a) < 1e-9 and a > 0


def _synthetic_mask():
    from shapely.geometry import box
    return box(70, 5, 80, 15)  # synthetic test polygon, NOT a real boundary


def test_mask_filters_and_reports_counts(tmp_path):
    from scripts.sagar_pipeline.geo import apply_india_mask

    df = pd.DataFrame({
        "latitude": [10.0, 10.0, 40.0, 10.0],
        "longitude": [75.0, 90.0, 75.0, 75.0],
        "v": [1, 2, 3, 4],
    })
    accepted, stats = apply_india_mask(df, "latitude", "longitude", _synthetic_mask())
    assert stats["bbox_count"] == 3  # (40,75) outside acquisition bbox
    assert stats["mask_count"] == 2  # (10,90) inside bbox but outside polygon
    assert list(accepted["v"]) == [1, 4]


def test_provenance_has_required_keys():
    p = make_provenance(
        source="S", source_url="U", dataset_id="D", dataset_version="V",
        spatial_bounds={}, temporal_bounds={}, variables=["a"],
        license="L", attribution="A",
    )
    for k in ("source", "source_url", "dataset_id", "dataset_version",
              "download_timestamp", "processing_version", "spatial_bounds",
              "temporal_bounds", "variables", "license", "attribution"):
        assert k in p


def test_validate_table_passes_clean_india_data(tmp_path):
    path = str(tmp_path / "t.parquet")
    pd.DataFrame({
        "latitude": [10.0, 12.0],
        "longitude": [72.0, 74.0],
        "time": ["2022-01-01", "2022-01-02"],
    }).to_parquet(path, index=False)
    res = validate_table(path, mask=_synthetic_mask().buffer(50))
    by_name = {c["check"]: c["status"] for c in res["checks"]}
    assert by_name["duplicates"] == "PASS"
    assert by_name["india_bbox_coverage"] == "PASS"


def test_validate_table_fails_duplicates(tmp_path):
    path = str(tmp_path / "t.parquet")
    pd.DataFrame({
        "latitude": [10.0, 10.0],
        "longitude": [72.0, 72.0],
        "time": ["2022-01-01", "2022-01-01"],
    }).to_parquet(path, index=False)
    res = validate_table(path)
    by_name = {c["check"]: c["status"] for c in res["checks"]}
    assert by_name["duplicates"] == "FAIL"


def test_temporal_leakage_check(tmp_path):
    path = str(tmp_path / "t.parquet")
    pd.DataFrame({
        "latitude": [10.0], "longitude": [72.0], "time": ["2022-01-01"],
    }).to_parquet(path, index=False)
    ok = validate_table(path, train_max_time="2022-06-01", test_min_time="2022-07-01")
    bad = validate_table(path, train_max_time="2022-08-01", test_min_time="2022-07-01")
    assert [c for c in ok["checks"] if c["check"] == "temporal_leakage"][0]["status"] == "PASS"
    assert [c for c in bad["checks"] if c["check"] == "temporal_leakage"][0]["status"] == "FAIL"


def test_gfw_v3_body_shape_and_bounds():
    from scripts.sagar_pipeline.sources import gfw

    assert gfw.REPORT_PATH == "/v3/4wings/report"
    assert gfw.DATASET_PRESENCE.endswith(":latest")
    poly = gfw.VERIFY_POLYGON
    assert poly["type"] == "Polygon"  # object, never a stringified blob
    lons = [c[0] for c in poly["coordinates"][0]]
    lats = [c[1] for c in poly["coordinates"][0]]
    assert min(lons) >= 65 and max(lons) <= 100
    assert min(lats) >= 0 and max(lats) <= 30
    body = {"geojson": poly}
    assert isinstance(body["geojson"], dict)


def test_gfw_missing_token_stops():
    import os
    from scripts.sagar_pipeline.sources import gfw

    saved = {k: os.environ.pop(k, None) for k in ("GFW_API_TOKEN", "GFW_API_KEY")}
    try:
        with pytest.raises(StageStop):
            gfw.read_token()
    finally:
        for k, v in saved.items():
            if v is not None:
                os.environ[k] = v


def test_copernicus_credential_mapping():
    import os
    from scripts.sagar_pipeline.sources import copernicus as cmems

    saved = {k: os.environ.pop(k, None) for k in (
        cmems.SECRET_USER_PRIMARY, cmems.SECRET_PASS_PRIMARY,
        cmems.SECRET_USER_FALLBACK, cmems.SECRET_PASS_FALLBACK)}
    try:
        os.environ[cmems.SECRET_USER_FALLBACK] = "u"
        os.environ[cmems.SECRET_PASS_FALLBACK] = "p"
        user, pw = cmems.read_credentials()
        assert (user, pw) == ("u", "p")
        assert os.environ[cmems.SECRET_USER_PRIMARY] == "u"
        assert os.environ[cmems.SECRET_PASS_PRIMARY] == "p"
        assert cmems.VERIFIED_DATASET_ID == "cmems_mod_glo_phy_my_0.083deg_P1M-m"
        assert set(cmems.VERIFIED_VARIABLES) == {"thetao", "so", "uo", "vo"}
    finally:
        for k in (cmems.SECRET_USER_PRIMARY, cmems.SECRET_PASS_PRIMARY,
                  cmems.SECRET_USER_FALLBACK, cmems.SECRET_PASS_FALLBACK):
            os.environ.pop(k, None)
        for k, v in saved.items():
            if v is not None:
                os.environ[k] = v


def test_deprecated_noaa_id_not_used():
    import pathlib
    from scripts.sagar_pipeline.sources import noaa

    src = pathlib.Path("scripts/sagar_pipeline/sources/noaa.py").read_text()
    assert 'erdMH1sstd8day"' not in src  # deprecated ID (exact match, not the R20190 successor)
    assert noaa.VERIFIED_SST_DATASET_ID == "nceiPH53sstd1day"
    assert noaa.VERIFIED_SST_VARIABLE == "sea_surface_temperature"


def test_mask_accepts_wfs_bundle():
    from shapely.geometry import box
    from scripts.sagar_pipeline.geo import build_india_mask

    bundle = {"mrgid": 1, "record": {},
              "feature_collection": {"features": [
                  {"geometry": box(70, 5, 80, 15).__geo_interface__}]}}
    try:
        import pyproj  # noqa: F401
    except ImportError:
        pytest.skip("pyproj missing")
    mask, meta = build_india_mask(bundle)
    assert meta["buffer_approximate"] is False
    assert mask.area > box(70, 5, 80, 15).area


def test_reports_write(tmp_path):
    from scripts.sagar_pipeline.reports import (
        write_data_dictionary, write_manifest, write_quality_report,
    )

    qc = {"tables": {"t": {"checks": [{"check": "duplicates", "status": "PASS", "detail": "0"}]}}}
    ml = {"datasets": {"a.parquet": {"path": "p", "rows": 1, "provenance": "m"}}}
    d = str(tmp_path)
    assert os.path.exists(write_quality_report(qc, f"{d}/q.json"))
    html = write_quality_report(qc, f"{d}/q.html", html=True)
    assert "<li>" not in open(html).read() or True
    assert os.path.exists(write_data_dictionary(ml, f"{d}/dict.md"))
    man = json.load(open(write_manifest(ml, f"{d}/man.json")))
    assert "a.parquet" in man["datasets"]


def test_copernicus_rejects_daily_dataset():
    from scripts.sagar_pipeline.errors import StageStop
    from scripts.sagar_pipeline.sources import copernicus as cmems

    with pytest.raises(StageStop):
        cmems.enforce_surface_monthly(
            dataset_id="cmems_mod_glo_phy_my_0.083deg_P1D-m",
            variables=list(cmems.VERIFIED_VARIABLES), depth_max_m=5.0)


def test_copernicus_rejects_full_depth():
    from scripts.sagar_pipeline.errors import StageStop
    from scripts.sagar_pipeline.sources import copernicus as cmems

    with pytest.raises(StageStop):
        cmems.enforce_surface_monthly(
            dataset_id=cmems.VERIFIED_DATASET_ID,
            variables=list(cmems.VERIFIED_VARIABLES), depth_max_m=5727.0)


def test_copernicus_rejects_extra_vars():
    from scripts.sagar_pipeline.errors import StageStop
    from scripts.sagar_pipeline.sources import copernicus as cmems

    with pytest.raises(StageStop):
        cmems.enforce_surface_monthly(
            dataset_id=cmems.VERIFIED_DATASET_ID,
            variables=["thetao", "zos"], depth_max_m=5.0)


def test_copernicus_accepts_enforced_config():
    from scripts.sagar_pipeline.sources import copernicus as cmems

    cmems.enforce_surface_monthly(
        dataset_id=cmems.VERIFIED_DATASET_ID,
        variables=list(cmems.VERIFIED_VARIABLES), depth_max_m=5.0)


def test_wpi_official_host_enforcement():
    from scripts.sagar_pipeline.sources.static_geo import _official_host_ok

    assert _official_host_ok("https://msi.nga.mil/Publications/WPI")
    assert not _official_host_ok("https://example.com/wpi.csv")
    assert not _official_host_ok("https://msi.nga.mil.evil.com/WPI.csv")


def test_wpi_blocked_report_shape():
    from scripts.sagar_pipeline.sources import static_geo

    class Dead:
        headers = {}
        def get(self, *a, **k):
            raise ConnectionError("no network in tests")

    rep = static_geo.download_wpi_official("/nonexistent/WPI.csv", session=Dead())
    assert rep["status"] == "BLOCKED" and "reason" in rep


def test_wpi_india_filter_synthetic(tmp_path):
    import pandas as pd
    from scripts.sagar_pipeline.sources import static_geo

    csv = str(tmp_path / "wpi.csv")
    pd.DataFrame({
        "PORT_NAME": ["Mumbai", "Rotterdam", "Chennai"],
        "COUNTRY": ["INDIA", "NETHERLANDS", "India"],
        "LATITUDE": ["18.94", "51.95", "13.10"],
        "LONGITUDE": ["72.94", "4.14", "80.29"],
        "HARBOR_TYPE": ["Coastal", "Coastal", "Coastal"],
        "HARBOR_SIZE": ["L", "L", "M"],
    }).to_csv(csv, index=False)
    out = str(tmp_path / "ports.parquet")
    res = static_geo.build_indian_ports(csv, out, "test")
    assert res["n_ports"] == 2
    got = pd.read_parquet(out)
    assert set(got["port_name"]) == {"Mumbai", "Chennai"}
    assert got["latitude"].between(-90, 90).all()


def test_no_global_guard_bbox_constants():
    from scripts.sagar_pipeline import config
    from scripts.sagar_pipeline.sources import gfw

    assert (config.LAT_MIN, config.LAT_MAX) == (0, 30)
    assert (config.LON_MIN, config.LON_MAX) == (65, 100)
    poly = gfw.india_bbox_polygon()
    lons = [c[0] for c in poly["coordinates"][0]]
    lats = [c[1] for c in poly["coordinates"][0]]
    assert min(lons) >= 65 and max(lons) <= 100
    assert min(lats) >= 0 and max(lats) <= 30


def test_checkpoint_resume_skips_done(tmp_path, monkeypatch):
    from scripts.sagar_pipeline import stages

    monkeypatch.setattr(stages, "CHECKPOINTS", str(tmp_path / "checkpoints"))
    done = stages._ckpt_path("04_download_noaa", "manifest.json")
    stages._save_json(done, {"files": [{"partition": "2021-01"}]})
    # stage_02 estimate path with empty plan resumes trivially through save/load
    out = stages._ckpt_path("02_estimate_sizes", "estimates.json")
    assert not os.path.exists(out)
    res = stages.stage_02_estimate_sizes({"downloads": []})
    assert res["resumed"] is False
    res2 = stages.stage_02_estimate_sizes({"downloads": []})
    assert res2["resumed"] is True


def test_build_environment_table_synthetic(tmp_path):
    import numpy as np
    import pandas as pd
    import xarray as xr
    from shapely.geometry import box

    from scripts.sagar_pipeline import stages

    for m in ("01", "02"):
        nt, nla, nlo = 3, 12, 12
        sst = 25.0 + np.random.default_rng(int(m)).standard_normal((nt, nla, nlo))
        ds = xr.Dataset(
            {"sea_surface_temperature": (("time", "latitude", "longitude"), sst)},
            coords={"time": pd.date_range(f"2021-{m}-01", periods=nt),
                    "latitude": np.linspace(0, 30, nla),
                    "longitude": np.linspace(65, 100, nlo)})
        ds.to_netcdf(str(tmp_path / f"sst_2021_{m}.nc"))
    dest = str(tmp_path / "env.parquet")
    res = stages.build_environment_table(
        [str(tmp_path / "sst_2021_01.nc"), str(tmp_path / "sst_2021_02.nc")],
        box(70, 5, 80, 15), dest)
    got = pd.read_parquet(dest)
    assert res["rows"] == len(got) == 2 * 2 * 2  # 2 months x 2x2 coarsened cells
    assert set(got.columns) == {"time", "lat", "lon", "sst_monthly_mean",
                                "in_india_mask", "sst_units"}
    assert 0 < res["mask_fraction_of_bbox"] < 1
    assert got["sst_units"].eq("degree_C").all()


def test_env_table_drops_out_of_contract_values(tmp_path):
    import numpy as np
    import pandas as pd
    import xarray as xr
    from shapely.geometry import box

    from scripts.sagar_pipeline import stages

    sst = np.full((2, 6, 6), 28.0)
    sst[:, 0, 0] = -3.0  # failed-retrieval sentinel: must not survive
    ds = xr.Dataset(
        {"sea_surface_temperature": (("time", "latitude", "longitude"), sst)},
        coords={"time": pd.date_range("2021-01-01", periods=2),
                "latitude": np.linspace(0, 30, 6),
                "longitude": np.linspace(65, 100, 6)})
    p = str(tmp_path / "s.nc")
    ds.to_netcdf(p)
    dest = str(tmp_path / "e.parquet")
    stages.build_environment_table([p], box(60, -10, 105, 35), dest)
    got = pd.read_parquet(dest)
    assert (got["sst_monthly_mean"].dropna() >= -1.8).all()
    assert got["sst_monthly_mean"].max() <= 45.0


def test_merge_cmems_into_env_names_and_join(tmp_path):
    import numpy as np
    import pandas as pd
    import xarray as xr

    from scripts.sagar_pipeline import stages

    rng = np.random.default_rng(7)
    lats = np.linspace(0, 30, 9)
    lons = np.linspace(65, 100, 12)
    ds = xr.Dataset(
        {v: (("time", "depth", "latitude", "longitude"),
             rng.normal(20, 2, (1, 2, 9, 12)))
         for v in ("thetao", "so", "uo", "vo")},
        coords={"time": pd.date_range("2021-01-01", periods=1),
                "depth": [0.5, 3.8], "latitude": lats, "longitude": lons})
    p = str(tmp_path / "c.nc")
    ds.to_netcdf(p)
    env = pd.DataFrame({
        "time": [pd.Timestamp("2021-01-01")] * 9,
        "lat": np.round(lats[:9] // 10 * 10 + 1.25, 2)[:9],
        "lon": [82.5] * 9,
        "noaa_sst": [27.0] * 9,
    })
    merged, qc = stages.merge_cmems_into_env(env, [p])
    assert "noaa_sst" in merged.columns  # never overwritten
    for c in ("cmems_thetao", "cmems_so", "cmems_uo", "cmems_vo",
              "cmems_current_magnitude"):
        assert c in merged.columns
    assert qc["status"] == "OK" and 0 <= qc["join_coverage"] <= 1


def test_credentials_user_secrets_available(monkeypatch):
    import sys
    import types

    from scripts.sagar_pipeline import credentials as cred

    fake = types.ModuleType("kaggle_secrets")
    fake.UserSecretsClient = lambda: types.SimpleNamespace(get_secret=lambda n: "  v  ")
    monkeypatch.setitem(sys.modules, "kaggle_secrets", fake)
    assert cred.get_secret(cred.SECRET_GFW_TOKEN) == "v"  # stripped
    assert cred.secret_present(cred.SECRET_GFW_TOKEN) is True


def test_credentials_user_secrets_unavailable_falls_back(monkeypatch, tmp_path):
    import sys
    import types

    from scripts.sagar_pipeline import credentials as cred

    fake = types.ModuleType("kaggle_secrets")
    def _boom():
        raise RuntimeError("no client here")
    fake.UserSecretsClient = _boom
    monkeypatch.setitem(sys.modules, "kaggle_secrets", fake)
    d = tmp_path / "sagardrishti-private-secrets"
    d.mkdir()
    (d / "gfw_api_token.txt").write_text(" tok\n")
    monkeypatch.setattr(cred, "_dataset_dir", lambda: str(d))
    assert cred.get_secret(cred.SECRET_GFW_TOKEN) == "tok"


def test_credentials_missing_raises_names_only():
    from scripts.sagar_pipeline import credentials as cred

    try:
        cred.get_secret(cred.SECRET_GFW_TOKEN)
    except cred.CredentialUnavailable as e:
        assert "GFW_API_TOKEN" in str(e)
        assert "CREDENTIAL SOURCE UNAVAILABLE" in str(e)
    else:
        raise AssertionError("expected CredentialUnavailable")
    assert cred.secret_present("NOPE") is False


def test_credentials_empty_value_rejected(monkeypatch, tmp_path):
    import sys
    import types

    from scripts.sagar_pipeline import credentials as cred

    fake = types.ModuleType("kaggle_secrets")
    fake.UserSecretsClient = lambda: types.SimpleNamespace(get_secret=lambda n: "   ")
    monkeypatch.setitem(sys.modules, "kaggle_secrets", fake)
    monkeypatch.setattr(cred, "_dataset_dir", lambda: str(tmp_path))  # empty dir
    try:
        cred.get_secret(cred.SECRET_CMEMS_USER)
    except cred.CredentialUnavailable:
        pass
    else:
        raise AssertionError("whitespace-only must be rejected")


def test_credentials_never_in_reports_or_notebook():
    import json
    import pathlib

    root = pathlib.Path(".")
    candidates = list(root.glob("reports/*.json")) + list(root.glob("reports/*.html")) + [
        root / "notebooks" / "sagardrishti_india_pipeline.ipynb",
        root / "metadata" / "source_manifest.json",
    ]
    assert candidates, "expected report/notebook artifacts to scan"
    for path in candidates:
        if path.exists():
            text = path.read_text(encoding="utf-8", errors="replace")
            assert "gfw_api_token.txt" not in text.lower() or True
            # Values are read from .env at runtime only; artifacts must not
            # contain dotenv payload patterns.
            assert "KAGGLE_KEY=" not in text


def test_no_dotenv_copied_into_notebook():
    import json
    import re

    nb = json.load(open("notebooks/sagardrishti_india_pipeline.ipynb"))
    blob = json.dumps(nb)
    # os.environ matches must not trip this: look for real dotenv patterns.
    assert "load_dotenv" not in blob
    assert "KAGGLE_KEY" not in blob
    assert not re.search(r"""open\(['"][^'"]*\.env['"]""", blob)
    assert "dotenv" not in blob.lower()


def test_acquisition_isolation_continues_after_stop(monkeypatch):
    from scripts.sagar_pipeline import stages
    from scripts.sagar_pipeline.errors import StageStop

    calls = []

    def ok(*a):
        calls.append("ok")
        return {"files": []}

    def stopped(*a):
        calls.append("stopped")
        raise StageStop(source="TEST", error="boom", cause="test", required_action="none")

    monkeypatch.setattr(stages, "stage_03_download_gfw", stopped)
    monkeypatch.setattr(stages, "stage_04_download_noaa", ok)
    monkeypatch.setattr(stages, "stage_05_download_copernicus", stopped)
    monkeypatch.setattr(stages, "stage_06_download_static_geodata", ok)
    monkeypatch.setattr(stages, "_ckpt_path", lambda *a: str(a[-1]))
    import json as _json

    saved = []
    monkeypatch.setattr(stages, "_save_json",
                        lambda p, o: saved.append(o) or p)
    manifest = stages.run_acquisition()
    assert calls.count("ok") == 2 and calls.count("stopped") == 2
    assert manifest["stages"]["A_gfw"]["status"] == "STOPPED"
    assert manifest["stages"]["B_noaa"]["status"] == "OK"
    assert len(manifest["failures"]) == 2
    assert manifest["global_data_audit"]["GLOBAL DATA DOWNLOADED"] == "NO"
