"""src/daily_pipeline package: fetch/validate/features/predict/monitor/run_daily (idempotent)."""
import datetime, json, os
import pandas as pd

BASE = "data/ml/daily"
PRED = "data/predictions/daily_predictions.parquet"

def _ports():
    return pd.read_parquet("data/reference/india_ports.parquet")

def source_check():
    import glob
    gfw_days = len(glob.glob("data/raw/daily_gfw/year=*/month=*/.complete"))
    noaa = sorted(glob.glob("data/kaggle_output/noaa/*.nc"))
    cm = sorted(glob.glob("data/kaggle_output/copernicus/*/*.nc"))
    return {"gfw_partitions": gfw_days, "noaa_files": len(noaa), "noaa_latest": "2023-12-31 (product ended)",
            "cmems_months": len(cm), "checked_at": datetime.datetime.now(datetime.timezone.utc).isoformat()}

def freshness():
    m = pd.read_parquet(BASE + "/sagardrishti_daily_master_training_final.parquet", columns=["date"])
    latest = pd.to_datetime(m["date"]).max()
    age = (pd.Timestamp.now(tz="UTC").normalize() - latest).days
    return {"local_latest_date": str(latest.date()), "data_age_days": int(age),
            "status": "STALE" if age > 45 else ("FRESH" if age <= 10 else "STALE"),
            "note": "GFW through 2026-08-31; NOAA SST ends 2023-12-31 (product termination, not pipeline failure)"}

def build_features_for(date):
    """Assemble X(t) row for a date from the final master (same registry as training)."""
    feats = json.load(open(BASE + "/daily_final_feature_set.json"))["features"]
    m = pd.read_parquet(BASE + "/sagardrishti_daily_master_training_final.parquet")
    m["date"] = pd.to_datetime(m["date"], utc=True)
    d = pd.to_datetime(date, utc=True).normalize()
    rows = m[m.date == d]
    if rows.empty:
        raise ValueError(f"no observations for {d.date()}")
    rows = rows.copy()
    rows["port_name"] = rows.port_id.map(_ports().set_index("port_id")["port_name"].to_dict())
    keep = rows[["port_id", "port_name"]].copy()
    return keep, rows[feats], feats

def predict_for(target_date):
    """Predict Y(D) using X(D-1). Returns + stores predictions with uncertainty."""
    import joblib
    d = pd.to_datetime(target_date, utc=True).normalize()
    keep, X, feats = build_features_for(d - pd.Timedelta(days=1))
    out = keep.copy()
    out["prediction_date"] = str((d - pd.Timedelta(days=1)).date())
    out["target_date"] = str(d.date())
    for tname, mname, col, lo, hi in [("traffic", "traffic_model", "traffic_prediction", "traffic_lower", "traffic_upper"),
                                      ("congestion", "congestion_model", "congestion_prediction", "congestion_lower", "congestion_upper")]:
        pipe = joblib.load(f"models/daily/{mname}/model.joblib")
        meta = json.load(open(f"models/daily/{mname}/model_metadata.json"))
        p = pipe.predict(X)
        out[col] = p
        out[lo] = p - 1.28 * meta["sigma_val"]
        out[hi] = p + 1.28 * meta["sigma_val"]
        out[f"{tname[:4]}_model_version"] = meta["model_name"]
    out["source_latest_dates"] = "GFW 2026-08-31; NOAA 2023-12-31; CMEMS 2026-05"
    out["prediction_timestamp"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    return out

def store_predictions(df):
    os.makedirs("data/predictions", exist_ok=True)
    if os.path.exists(PRED):
        old = pd.read_parquet(PRED)
        df = pd.concat([old[~old.target_date.isin(df.target_date.unique())], df], ignore_index=True)
    df.to_parquet(PRED, index=False)
    return len(df)

def run_daily(target_date=None):
    """Idempotent daily run: check -> features -> predict -> store -> monitor snippet."""
    if target_date is None:
        m = pd.read_parquet(BASE + "/sagardrishti_daily_master_training_final.parquet", columns=["date"])
        target_date = str((pd.to_datetime(m["date"]).max() + pd.Timedelta(days=0)).date())
    sc = source_check(); fr = freshness()
    preds = predict_for(target_date)
    n = store_predictions(preds)
    mon = {"run": str(pd.Timestamp.now(tz="UTC")), "target_date": target_date, "rows": len(preds),
           "source_check": sc, "freshness": fr}
    os.makedirs("reports/daily_model_monitoring", exist_ok=True)
    json.dump(mon, open("reports/daily_model_monitoring/last_run.json", "w"), indent=2, default=str)
    print(f"run_daily {target_date}: {len(preds)} ports, store={n} rows")
    return preds
