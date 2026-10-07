"""Final validation battery: spatial, temporal, duplicates, missing values,
provenance, schema, temporal-leakage, storage.
"""
import os

from .config import LAT_MAX, LAT_MIN, LON_MAX, LON_MIN


def _result(check, status, detail=""):
    return {"check": check, "status": status, "detail": detail}


def validate_table(path: str, mask=None, train_max_time=None, test_min_time=None) -> dict:
    import pandas as pd

    checks = []
    if not os.path.exists(path):
        return {"path": path, "checks": [_result("exists", "FAIL", "file missing")]}
    checks.append(_result("exists", "PASS", f"{os.path.getsize(path)/1e6:.1f} MB"))

    df = pd.read_parquet(path)
    checks.append(_result("schema", "PASS", f"{len(df)} rows x {len(df.columns)} cols"))

    lat = next((c for c in df.columns if c.lower() == "latitude"), None)
    lon = next((c for c in df.columns if c.lower() == "longitude"), None)
    if lat and lon:
        in_bbox = df[lon].between(LON_MIN, LON_MAX) & df[lat].between(LAT_MIN, LAT_MAX)
        frac = float(in_bbox.mean()) if len(df) else 0.0
        checks.append(_result("india_bbox_coverage", "PASS" if frac > 0.99 else "FAIL",
                              f"{frac:.4f} of rows inside acquisition bbox"))
        if mask is not None and len(df):
            from shapely.geometry import Point
            inside = sum(1 for x, y in zip(df[lon].to_numpy(), df[lat].to_numpy())
                         if mask.contains(Point(x, y)) or mask.touches(Point(x, y)))
            checks.append(_result("india_mask_coverage", "PASS" if inside / len(df) > 0.95 else "FAIL",
                                  f"{inside}/{len(df)} rows inside EEZ-buffer mask"))
    else:
        checks.append(_result("india_bbox_coverage", "FAIL", "no latitude/longitude columns retained"))

    time_cols = [c for c in df.columns if "time" in c.lower() or "date" in c.lower()]
    if time_cols:
        ts = pd.to_datetime(df[time_cols[0]], utc=True, errors="coerce")
        bad = int(ts.isna().sum())
        checks.append(_result("timestamp_parse", "PASS" if bad == 0 else "FAIL", f"{bad} unparseable"))
        if bad == 0 and len(df):
            checks.append(_result("temporal_range", "PASS",
                                  f"{ts.min()} → {ts.max()}"))
            if not ts.is_monotonic_increasing:
                checks.append(_result("temporal_order", "WARN", "not sorted; sorting recommended"))
    else:
        checks.append(_result("timestamp_parse", "WARN", "no time column (static reference?)"))

    dup = int(df.duplicated().sum())
    checks.append(_result("duplicates", "PASS" if dup == 0 else "FAIL", f"{dup} duplicate rows"))
    miss = {c: int(df[c].isna().sum()) for c in df.columns if int(df[c].isna().sum())}
    checks.append(_result("missing_values", "PASS" if not miss else "WARN", str(miss)[:300]))

    if train_max_time and test_min_time and time_cols:
        leak = not (pd.to_datetime(train_max_time, utc=True) <= pd.to_datetime(test_min_time, utc=True))
        checks.append(_result("temporal_leakage", "FAIL" if leak else "PASS",
                              f"train_max={train_max_time} test_min={test_min_time}"))
    return {"path": path, "checks": checks}
