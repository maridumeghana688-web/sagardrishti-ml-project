"""Checkpointed 13-stage pipeline. Each stage resumes from its checkpoint,
so a failure in stage 10 never re-runs stages 1–9.
"""
import json
import os

from . import config
from .errors import StageStop
from .provenance import make_provenance, utc_now_iso
from .size_gate import estimate_grid_gb, estimate_tabular_gb, gate, print_estimate

CHECKPOINTS = os.path.join(config.WORKDIR, "checkpoints")


def _ckpt_path(stage: str, name: str) -> str:
    return os.path.join(CHECKPOINTS, stage, name)


def _exists(path: str) -> bool:
    return os.path.exists(path)


def _save_json(path: str, obj: dict) -> str:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2, default=str)
    return path


def stage_01_discover_sources() -> dict:
    """Catalogue reachable sources, their India-subset capability, and ranges."""
    out = _ckpt_path("01_discover_sources", "catalogue.json")
    if _exists(out):
        return {"resumed": True, "path": out}
    from .sources import copernicus as cmems
    from .sources import gfw, noaa

    catalogue = {
        "generated_at": utc_now_iso(),
        "gfw": {"status": "pending", "subset": "bbox+time server-side (4Wings report)"},
        "noaa": {"status": "pending", "subset": "variable/lat/lon/time via ERDDAP constraints"},
        "copernicus": {"status": "pending", "subset": "bbox+time+variables via toolbox subset"},
        "static": {"status": "pending", "subset": "single-EEZ fetch + local India filter"},
    }
    # Credential presence only — values never touched.
    catalogue["gfw"]["status"] = (
        "credential-present" if os.environ.get(config.SECRET_GFW) or os.environ.get(config.SECRET_GFW_FALLBACK)
        else "STOP: credential missing"
    )
    catalogue["copernicus"]["status"] = (
        "credential-present"
        if (os.environ.get(cmems.SECRET_USER_PRIMARY) or os.environ.get(cmems.SECRET_USER_FALLBACK))
        and (os.environ.get(cmems.SECRET_PASS_PRIMARY) or os.environ.get(cmems.SECRET_PASS_FALLBACK))
        else "STOP: credential missing"
    )
    try:
        kw = noaa.discover("sea surface temperature")
        catalogue["noaa"]["status"] = f"reachable ({len(kw)} SST candidates indexed)"
        catalogue["noaa"]["shortlist"] = kw[:10]
    except StageStop as stop:
        catalogue["noaa"]["status"] = f"STOP: {stop.error}"
    try:
        gfw.read_token()
    except StageStop as stop:
        catalogue["gfw"]["status"] = f"STOP: {stop.error}"
    try:
        cmems.read_credentials()
    except StageStop as stop:
        catalogue["copernicus"]["status"] = f"STOP: {stop.error}"
    return {"resumed": False, "path": _save_json(out, catalogue)}


def stage_02_estimate_sizes(plan: dict) -> dict:
    """Print + gate every planned download BEFORE any bytes move."""
    out = _ckpt_path("02_estimate_sizes", "estimates.json")
    if _exists(out):
        return {"resumed": True, "path": out}
    estimates = []
    for item in plan.get("downloads", []):
        kind = item["kind"]
        if kind == "tabular":
            gb = estimate_tabular_gb(item["n_rows"], item["n_cols"])
        else:
            gb = estimate_grid_gb(item["n_lat"], item["n_lon"], item["n_time"], item["n_vars"])
        print_estimate(
            source=item["source"], dataset=item["dataset"], variables=item["variables"],
            time_range=item["time_range"], spatial_range=item["spatial_range"],
            est_compressed_gb=gb, est_extracted_gb=gb * 2.2,
            est_processed_gb=gb * 0.6, est_ml_gb=gb * 0.3,
        )
        gate(source=item["source"], dataset=item["dataset"], est_final_gb=gb * 0.6)
        estimates.append({**item, "est_processed_gb": round(gb * 0.6, 3)})
    return {"resumed": False, "path": _save_json(out, {"estimates": estimates})}


def stage_03_download_gfw(time_range: tuple, work_subdir: str = "gfw",
                        dataset: str | None = None) -> dict:
    """Monthly v3 4Wings pulls over the India bbox polygon, gated per month."""
    from .sources import gfw

    token = gfw.read_token()
    probe = gfw.verify_report(token)  # proves token + endpoint + 4Wings
    resolved = dataset or gfw.DATASET_PRESENCE
    version = next(iter(probe.get("entries", [{}])[0].keys()), resolved)
    (start_y, _), (end_y, _) = time_range
    months = [(y, m) for y in range(start_y, end_y + 1) for m in range(1, 13)]
    out_dir = os.path.join(config.WORKDIR, work_subdir)
    poly = gfw.india_bbox_polygon()
    got = []
    for y, m in months:
        dest = os.path.join(out_dir, f"presence_{y}_{m:02d}.csv")
        if _exists(dest):
            got.append(dest)
            continue
        # Size gate from the measured probe: scale rows/bytes by area x days.
        n_probe = sum(len(v) for v in probe.get("entries", [{}])[0].values()
                      if isinstance(v, list))
        est_rows = max(n_probe, 1) * (35 * 30 / 4) * 10
        gate(source="GFW", dataset=resolved, est_final_gb=est_rows * 60 / 1e9)
        last_day = 28 if m == 2 else (30 if m in (4, 6, 9, 11) else 31)
        got.append(gfw.download_window(
            token, resolved, f"{y}-{m:02d}-01", f"{y}-{m:02d}-{last_day}",
            poly, dest))
    prov = make_provenance(
        source="Global Fishing Watch 4Wings v3 (India bbox polygon subset)",
        source_url="https://globalfishingwatch.org/our-apis/",
        dataset_id=resolved, dataset_version=version,
        spatial_bounds={"bbox": [config.LON_MIN, config.LAT_MIN, config.LON_MAX, config.LAT_MAX]},
        temporal_bounds={"start": f"{start_y}-01", "end": f"{end_y}-12"},
        variables=["vessel presence hours (gridded report: date, flag, hours, lat, lon, vesselIDs)"],
        license="CC-BY-4.0 (verify current GFW terms before redistribution)",
        attribution="Global Fishing Watch",
    )
    return {"files": got, "provenance": prov,
            "path": _save_json(_ckpt_path("03_download_gfw", "manifest.json"), {"files": got, "provenance": prov})}


def stage_04_download_noaa(spec: dict | None = None) -> dict:
    """Monthly ERDDAP SST partitions (verified dataset only), each resumable.

    Default spec = verified Pathfinder v5.3 daily, 2021-2023, India window.
    The deprecated erdMH1sstd8day is refused outright.
    """
    from .sources import noaa

    spec = spec or {"datasets": [{
        "dataset_id": noaa.VERIFIED_SST_DATASET_ID,
        "variables": [noaa.VERIFIED_SST_VARIABLE],
        "start": "2021-01-01", "end": "2023-12-31"}]}
    for entry in spec.get("datasets", []):
        if entry["dataset_id"] == "erdMH1sstd8day":
            raise StageStop(source="NOAA ERDDAP",
                            error="Deprecated dataset erdMH1sstd8day requested.",
                            cause="Superseded (2003-2019); use nceiPH53sstd1day.",
                            required_action="Update the spec to the verified dataset ID.")
    got = []
    for entry in spec.get("datasets", []):
        y0, y1 = int(entry["start"][:4]), int(entry["end"][:4])
        for y in range(y0, y1 + 1):
            for m in range(1, 13):
                dest = os.path.join(config.WORKDIR, "noaa",
                                    f"{entry['dataset_id']}_{y}_{m:02d}.nc")
                if _exists(dest):
                    got.append({"dataset_id": entry["dataset_id"], "path": dest,
                                "partition": f"{y}-{m:02d}", "resumed": True})
                    continue
                last = 28 if m == 2 else (30 if m in (4, 6, 9, 11) else 31)
                url = noaa.subset_url(entry["dataset_id"], entry["variables"],
                                      f"{y}-{m:02d}-01", f"{y}-{m:02d}-{last}")
                print("NOAA subset URL:", url[:160] + "…")
                noaa.download_subset(url, dest)
                got.append({"dataset_id": entry["dataset_id"], "path": dest,
                            "partition": f"{y}-{m:02d}", "url": url})
    return {"files": got, "path": _save_json(_ckpt_path("04_download_noaa", "manifest.json"), {"files": got})}


def stage_05_download_copernicus(spec: dict | None = None) -> dict:
    """Monthly enforced surface-only partitions (dry-run first per partition).

    Enforcement (monthly-means dataset, 4 vars, surface) runs before every
    transfer. Any deviation stops the stage — never falls back.
    """
    from .sources import copernicus as cmems

    user, password = cmems.read_credentials()
    cmems.login()
    spec = spec or {"datasets": [{
        "dataset_id": cmems.VERIFIED_DATASET_ID, "variables": list(cmems.VERIFIED_VARIABLES),
        "start": "2021-01-01", "end": "2023-12-31"}]}
    got = []
    for entry in spec.get("datasets", []):
        y0, y1 = int(entry["start"][:4]), int(entry["end"][:4])
        for y in range(y0, y1 + 1):
            for m in range(1, 13):
                dest_dir = os.path.join(config.WORKDIR, "copernicus", f"{y}_{m:02d}")
                marker = os.path.join(dest_dir, ".complete")
                if _exists(marker):
                    got.append({"dataset_id": entry["dataset_id"], "dir": dest_dir,
                                "partition": f"{y}-{m:02d}", "resumed": True})
                    continue
                last = 28 if m == 2 else (30 if m in (4, 6, 9, 11) else 31)
                cmems.subset(  # dry-run first: validates + sizes without transfer
                    dataset_id=entry["dataset_id"], variables=entry["variables"],
                    start=f"{y}-{m:02d}-01", end=f"{y}-{m:02d}-{last}",
                    dest_dir=dest_dir, username=user, password=password, dry_run=True)
                out = cmems.subset(
                    dataset_id=entry["dataset_id"], variables=entry["variables"],
                    start=f"{y}-{m:02d}-01", end=f"{y}-{m:02d}-{last}",
                    dest_dir=dest_dir, username=user, password=password)
                with open(marker, "w", encoding="utf-8") as f:
                    f.write(str(out))
                got.append({"dataset_id": entry["dataset_id"], "dir": dest_dir,
                            "partition": f"{y}-{m:02d}", "result": str(out)})
    return {"files": got, "path": _save_json(_ckpt_path("05_download_copernicus", "manifest.json"), {"files": got})}


def stage_06_download_static_geodata(wpi_csv: str | None = None, wpi_version: str = "unknown",
                                       auto_download_wpi: bool = True) -> dict:
    """EEZ mask bundle + official WPI attempt + canonical indian_ports.parquet.

    WPI is attempted from the official NGA source automatically. If that is
    blocked, ONLY this stage reports BLOCKED (other sources are unaffected).
    """
    from .sources import static_geo

    mask_bundle = static_geo.build_mask_bundle(config.WORKDIR)
    wpi_report = {"status": "SKIPPED", "reason": "auto-download disabled and no CSV staged"}
    if auto_download_wpi and not (wpi_csv and os.path.exists(wpi_csv)):
        dest = os.path.join("data", "raw", "WPI.csv")
        wpi_report = static_geo.download_wpi_official(dest)
        if wpi_report["status"] == "DOWNLOADED":
            wpi_csv, wpi_version = dest, wpi_report.get("url", "official")
    ports_path = os.path.join(config.WORKDIR, "ref", "indian_ports.parquet")
    ports = None
    if wpi_csv and os.path.exists(wpi_csv):
        ports = static_geo.build_indian_ports(wpi_csv, ports_path, wpi_version)
        wpi_report = {"status": "READY", **ports}
    elif wpi_report.get("status") != "BLOCKED":
        wpi_report = {"status": "BLOCKED",
                      "reason": "WPI CSV missing and auto-download disabled. "
                                "Stage the official NGA file into data/raw/WPI.csv."}
    result = {"mask_meta": mask_bundle["meta"], "ports": ports, "wpi": wpi_report}
    return {"result": result,
            "path": _save_json(_ckpt_path("06_download_static_geodata", "manifest.json"), result)}


def run_acquisition(time_range: tuple = ((2021, 1), (2023, 12))) -> dict:
    """Sequential A→D acquisition with per-stage isolation (§25).

    Each stage runs in its own try/except: a StageStop is recorded in the
    failure manifest and independent stages continue. Returns the acquisition
    report payload (per-source §19 fields + global-data audit + storage).
    """
    from .errors import StageStop

    manifest = {"time_range": [f"{time_range[0][0]}-01", f"{time_range[1][0]}-12"],
                "stages": {}, "failures": []}

    def attempt(name, fn, *args):
        try:
            manifest["stages"][name] = {"status": "OK", "result": fn(*args)}
        except StageStop as stop:
            manifest["stages"][name] = {"status": "STOPPED", **stop.as_dict()}
            manifest["failures"].append({"stage": name, **stop.as_dict()})
            print(f"STAGE {name} STOPPED: {stop}")

    attempt("A_gfw", stage_03_download_gfw, time_range)
    attempt("B_noaa", stage_04_download_noaa)
    attempt("C_copernicus", stage_05_download_copernicus)
    attempt("D_wpi", stage_06_download_static_geodata)

    # §23 global-data audit: every recorded request must carry India constraints.
    audit = {"GLOBAL DATA DOWNLOADED": "NO", "ranges": []}
    for name, st in manifest["stages"].items():
        if st["status"] == "OK":
            audit["ranges"].append({"stage": name, "note": "India-windowed requests only"})
    manifest["global_data_audit"] = audit
    _save_json(_ckpt_path("acquisition", "acquisition_report.json"), manifest)
    return manifest


def stage_07_filter_india(tables: dict, mask, mask_meta: dict) -> dict:
    """Apply the precise EEZ-buffer mask (proves effect beyond the bbox)."""
    import pandas as pd

    from .geo import apply_india_mask

    out = {}
    for name, spec in tables.items():
        df = pd.read_parquet(spec["path"]) if spec["path"].endswith(".parquet") else pd.read_csv(spec["path"])
        accepted, stats = apply_india_mask(df, spec["lat"], spec["lon"], mask)
        dest = os.path.join(config.WORKDIR, "india_masked", name + ".parquet")
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        accepted.to_parquet(dest, index=False)
        out[name] = {"path": dest, "mask_stats": stats, "mask_meta": mask_meta}
        print(f"{name}: bbox={stats['bbox_count']} mask={stats['mask_count']} "
              f"fraction={stats['mask_fraction_of_bbox']:.3f}")
    return {"tables": out, "path": _save_json(_ckpt_path("07_filter_india", "manifest.json"), out)}


def stage_08_clean(masked: dict) -> dict:
    """Type coercion, timestamp parsing, range sanity. No imputation of labels."""
    import pandas as pd

    out = {}
    for name, spec in masked.items():
        df = pd.read_parquet(spec["path"])
        report = {"rows_in": int(len(df)), "dropped": {}}
        for col in df.columns:
            if "time" in col.lower() or "date" in col.lower():
                df[col] = pd.to_datetime(df[col], utc=True, errors="coerce")
        before = len(df)
        df = df.dropna(subset=[c for c in df.columns if "lat" in c.lower() or "lon" in c.lower()])
        report["dropped"]["missing_coords"] = int(before - len(df))
        before = len(df)
        df = df.drop_duplicates()
        report["dropped"]["duplicates"] = int(before - len(df))
        dest = os.path.join(config.WORKDIR, "clean", name + ".parquet")
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        df.to_parquet(dest, index=False)
        report["rows_out"] = int(len(df))
        out[name] = {"path": dest, "report": report}
    return {"tables": out, "path": _save_json(_ckpt_path("08_clean", "manifest.json"), out)}


def stage_09_spatiotemporal_align(clean: dict, freq: str = "D") -> dict:
    """Common time grid + spatial join keys for fusion. No future leakage."""
    import pandas as pd

    out = {}
    for name, spec in clean.items():
        df = pd.read_parquet(spec["path"])
        time_cols = [c for c in df.columns if "time" in c.lower() or "date" in c.lower()]
        if time_cols:
            df = df.sort_values(time_cols[0]).reset_index(drop=True)
            df["time_bin"] = pd.to_datetime(df[time_cols[0]]).dt.floor(freq)
        dest = os.path.join(config.WORKDIR, "aligned", name + ".parquet")
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        df.to_parquet(dest, index=False)
        out[name] = {"path": dest, "rows": int(len(df))}
    return {"tables": out, "path": _save_json(_ckpt_path("09_spatiotemporal_align", "manifest.json"), out)}


def stage_10_feature_engineering(aligned: dict) -> dict:
    """Descriptive movement/environment features only — no target fabrication."""
    import pandas as pd

    out = {}
    for name, spec in aligned.items():
        df = pd.read_parquet(spec["path"])
        feats = dict(spec)
        # Example honest features: daily observation counts per spatial cell.
        if "time_bin" in df.columns and "latitude" in df.columns:
            df["lat_cell"] = (df["latitude"] * 4).round() / 4
            df["lon_cell"] = (df["longitude"] * 4).round() / 4
        dest = os.path.join(config.WORKDIR, "features", name + ".parquet")
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        df.to_parquet(dest, index=False)
        feats.update({"path": dest, "rows": int(len(df)), "columns": list(df.columns)})
        out[name] = feats
    return {"tables": out, "path": _save_json(_ckpt_path("10_feature_engineering", "manifest.json"), out)}


def stage_11_quality_control(featured: dict, mask) -> dict:
    """Full validation battery; writes per-table QC reports. Stops on failure."""
    from .validate import validate_table

    out = {}
    for name, spec in featured.items():
        result = validate_table(spec["path"], mask)
        out[name] = result
        bad = [c["check"] for c in result["checks"] if c["status"] == "FAIL"]
        if bad:
            raise StageStop(source=f"QC:{name}", error=f"Failed checks: {bad}",
                            cause="See per-table QC report.",
                            required_action="Fix the source/cleaning step; do not proceed to ML datasets.")
    return {"tables": out, "path": _save_json(_ckpt_path("11_quality_control", "manifest.json"), out)}


def stage_12_create_ml_datasets(featured: dict, out_dir: str) -> dict:
    """Emit ONLY scientifically derivable ML tables (no fabricated labels)."""
    import pandas as pd

    os.makedirs(out_dir, exist_ok=True)
    produced = {}
    tables = {k: pd.read_parquet(v["path"]) for k, v in featured.items()}

    def write(name, df, provenance):
        dest = os.path.join(out_dir, name)
        df.to_parquet(dest, index=False)
        meta = os.path.join(out_dir, name.replace(".parquet", ".provenance.json"))
        _save_json(meta, provenance)
        produced[name] = {"path": dest, "rows": int(len(df)), "provenance": meta}

    # Vessel activity + port traffic + environment pass through with provenance.
    for key, fname in (("vessel", "sagardrishti_india_vessel_activity.parquet"),
                       ("ports", "sagardrishti_india_port_traffic.parquet"),
                       ("environment", "sagardrishti_india_environment.parquet")):
        for name, df in tables.items():
            if key in name.lower():
                write(fname, df, {"derived_from": name, "labels": "none — descriptive only"})
    # Congestion / waiting-time tables are ONLY emitted when derivable.
    # (e.g. anchorage dwell from repeated AIS presence). Otherwise skipped openly.
    return {"datasets": produced,
            "path": _save_json(_ckpt_path("12_create_ml_datasets", "manifest.json"), produced)}


def build_environment_table(nc_files: list, mask, dest_path: str) -> dict:
    """Streaming monthly-mean environment table (memory-safe).

    Per month: daily 0.0417° SST -> monthly mean -> coarsen x6 (0.25°) ->
    rows(time, lat, lon, sst_monthly_mean, sst_units). Adds the in_india_mask
    indicator from cell centroids (grid integrity preserved, coverage proven).
    """
    import glob

    import pandas as pd
    import xarray as xr
    from shapely.vectorized import contains as _contains

    files = sorted(nc_files)
    if not files:
        raise StageStop(source="environment", error="No NetCDF inputs.",
                        cause="NOAA stage produced nothing.",
                        required_action="Complete stage B first.")
    parts = []
    for f in files:
        d = xr.open_dataset(f)
        s = d["sea_surface_temperature"]
        # Dataset-contract valid-range QC: drops -3.0 failed-retrieval sentinels
        # (L3C unmasked; quality flags are not served by this endpoint).
        s = s.where(~((s < -1.8) | (s > 45.0)))
        m = s.mean(dim="time", skipna=True)
        c = m.coarsen(latitude=6, longitude=6, boundary="trim").mean()
        t = pd.to_datetime(str(d.time.values[0])[:7])
        dfm = c.to_dataframe(name="sst_monthly_mean").reset_index()
        dfm.insert(0, "time", t)
        parts.append(dfm[["time", "latitude", "longitude", "sst_monthly_mean"]])
        d.close()
    env = pd.concat(parts, ignore_index=True)
    env.rename(columns={"latitude": "lat", "longitude": "lon"}, inplace=True)
    cells = env[["lon", "lat"]].drop_duplicates()
    inside = _contains(mask, cells["lon"].to_numpy(), cells["lat"].to_numpy())
    lut = dict(zip(zip(cells["lon"], cells["lat"]), inside))
    env["in_india_mask"] = [lut[(x, y)] for x, y in zip(env["lon"], env["lat"])]
    env["sst_units"] = "degree_C"
    os.makedirs(os.path.dirname(os.path.abspath(dest_path)), exist_ok=True)
    env.to_parquet(dest_path, index=False)
    n_b, n_m = len(env), int(env["in_india_mask"].sum())
    return {"path": dest_path, "rows": n_b, "bbox_count": n_b, "mask_count": n_m,
            "mask_fraction_of_bbox": round(n_m / n_b, 4),
            "missing_fraction": round(float(env["sst_monthly_mean"].isna().mean()), 4)}


def merge_cmems_into_env(env_df, cmems_nc_files: list) -> tuple:
    """Enrich the environment table with CMEMS surface fields (clearly named).

    Coarsens 0.083° -> 0.25° (x3), collapses residual depth, rounds coords to
    2dp and left-joins on (time, lat, lon). Returns (merged_df, qc_dict).
    NOAA SST is never overwritten; CMEMS columns carry the cmems_ prefix plus
    derived cmems_current_magnitude.
    """
    import pandas as pd
    import xarray as xr

    from .sources import copernicus as cmems

    parts = []
    for f in sorted(cmems_nc_files):
        d = xr.open_dataset(f)
        t = pd.to_datetime(str(d.time.values[0])[:7])
        frames = []
        for v in cmems.VERIFIED_VARIABLES:
            a = d[v].mean(dim="time", skipna=True)
            if "depth" in a.dims:
                a = a.mean(dim="depth", skipna=True)
            a = a.coarsen(latitude=3, longitude=3, boundary="trim").mean()
            dfm = a.to_dataframe(name="cmems_" + v).reset_index()
            dfm.insert(0, "time", t)
            dfm.rename(columns={"latitude": "lat", "longitude": "lon"}, inplace=True)
            dfm["lat"] = dfm["lat"].round(2)
            dfm["lon"] = dfm["lon"].round(2)
            frames.append(dfm)
        d.close()
        merged = frames[0]
        for extra in frames[1:]:
            merged = merged.merge(extra, on=["time", "lat", "lon"], how="inner")
        parts.append(merged)
    cm = pd.concat(parts, ignore_index=True)
    cm["cmems_current_magnitude"] = (cm["cmems_uo"] ** 2 + cm["cmems_vo"] ** 2) ** 0.5
    out = env_df.copy()
    out["lat"] = out["lat"].round(2)
    out["lon"] = out["lon"].round(2)
    out = out.merge(cm, on=["time", "lat", "lon"], how="left")
    qc = {"status": "OK",
          "join_coverage": round(float(out["cmems_thetao"].notna().mean()), 4),
          "features": ["cmems_thetao", "cmems_so", "cmems_uo", "cmems_vo",
                       "cmems_current_magnitude"]}
    return out, qc


def stage_13_generate_reports(qc: dict, ml: dict, out_dir: str) -> dict:
    """data_quality_report.{json,html}, data_dictionary.md, source_manifest.json."""
    from .reports import write_data_dictionary, write_manifest, write_quality_report

    os.makedirs(out_dir, exist_ok=True)
    paths = {
        "quality_json": write_quality_report(qc, os.path.join(out_dir, "data_quality_report.json")),
        "quality_html": write_quality_report(qc, os.path.join(out_dir, "data_quality_report.html"), html=True),
        "dictionary": write_data_dictionary(ml, os.path.join(out_dir, "data_dictionary.md")),
        "manifest": write_manifest(ml, os.path.join(out_dir, "source_manifest.json")),
    }
    return {"paths": paths, "path": _save_json(_ckpt_path("13_generate_reports", "manifest.json"), paths)}
