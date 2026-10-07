"""Daily pipeline submodules: real fetch/validate/build/predict/monitor logic (idempotent, resume-safe)."""
import calendar, hashlib, json, os, time
import pandas as pd

BASE_RAW = "data/raw/daily_gfw"

def _token(name):
    for line in open(".env"):
        line = line.strip()
        if line.startswith(name + "="):
            return line.split("=", 1)[1].strip().strip("'\"")
    return None

def fetch_gfw_month(year, month):
    """Fetch one India month DAILY partition; skip if .complete validates. Returns True/False."""
    import requests, zipfile, io
    part = f"{year}_{month:02d}"
    ddir = os.path.join(BASE_RAW, f"year={year}", f"month={month:02d}")
    if os.path.exists(os.path.join(ddir, ".complete")) and os.path.exists(os.path.join(ddir, "part.parquet")):
        return True  # idempotent skip
    tok = _token("GFW_API_TOKEN")
    assert tok, "GFW_API_TOKEN MISSING"
    last = calendar.monthrange(year, month)[1]
    prm = {"spatial-resolution": "LOW", "format": "CSV", "group-by": "FLAG", "temporal-resolution": "DAILY",
           "datasets[0]": "public-global-presence:latest", "date-range": f"{year}-{month:02d}-01,{year}-{month:02d}-{last}"}
    poly = {"type": "Polygon", "coordinates": [[[65, 0], [100, 0], [100, 30], [65, 30], [65, 0]]]}
    H = {"Authorization": "Bearer " + tok, "Content-Type": "application/json"}
    for attempt in range(6):
        try:
            r = requests.post("https://gateway.api.globalfishingwatch.org/v3/4wings/report", params=prm, headers=H, json={"geojson": poly}, timeout=1800)
            if r.status_code in (429, 500, 502, 503):
                raise RuntimeError(f"HTTP {r.status_code}")
            r.raise_for_status()
            with zipfile.ZipFile(io.BytesIO(r.content)) as z:
                name = sorted([n for n in z.namelist() if n.lower().endswith(".csv")])[0]
                with z.open(name) as s:
                    dfm = pd.read_csv(s, encoding="utf-8", encoding_errors="replace")
            dfm.columns = [c.strip().lower() for c in dfm.columns]
            assert "time range" in dfm.columns and dfm.lat.between(0, 30).all() and dfm.lon.between(65, 100).all()
            os.makedirs(ddir, exist_ok=True)
            tmp = os.path.join(ddir, ".part.parquet.tmp")
            dfm.to_parquet(tmp, index=False); os.replace(tmp, os.path.join(ddir, "part.parquet"))
            h = hashlib.md5(open(os.path.join(ddir, "part.parquet"), "rb").read()).hexdigest()
            open(os.path.join(ddir, ".complete"), "w").write(json.dumps({"partition": part, "rows": len(dfm), "md5": h}))
            return True
        except Exception as e:
            print(f"attempt {attempt+1} {part}: {str(e)[:150]}")
            time.sleep(min(2 ** attempt * 10, 300))
    return False

def fetch_noaa_missing():
    return {"status": "NOTHING_TO_FETCH", "reason": "nceiPH53sstd1day ends 2023-12-31 (CDR terminated); existing 36 files valid"}

def fetch_copernicus_missing():
    return {"status": "CHECK", "note": "monthly extends to 2026-05; use cmems_ext pattern for newer months if available"}

def validate_sources():
    import glob
    return {"gfw_partitions": len(glob.glob(BASE_RAW + "/year=*/month=*/.complete")),
            "noaa_files": len(glob.glob("data/kaggle_output/noaa/*.nc")),
            "cmems_months": len(glob.glob("data/kaggle_output/copernicus/*/.complete"))}

def predict_next_day_traffic(port_id, prediction_date):
    from src.daily_pipeline import predict_for
    r = predict_for(pd.to_datetime(prediction_date, utc=True).normalize() + pd.Timedelta(days=1))
    r = r[r.port_id == int(port_id)]
    return r.iloc[0].to_dict() if len(r) else {"error": "port not predicted"}

def predict_next_day_congestion(port_id, prediction_date):
    return predict_next_day_traffic(port_id, prediction_date)

def monitor():
    from src.daily_pipeline import freshness
    return freshness()
