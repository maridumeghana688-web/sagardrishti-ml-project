"""Website-integration-ready inference interface (no website modified)."""
import pandas as pd

def get_daily_predictions():
    return pd.read_parquet("data/predictions/daily_predictions.parquet")

def get_daily_predictions_for_port(port_id):
    df = get_daily_predictions()
    return df[df.port_id == int(port_id)]

def get_next_day(port_id, prediction_date):
    from src.daily_pipeline import predict_for
    d = pd.to_datetime(prediction_date, utc=True).normalize() + pd.Timedelta(days=1)
    r = predict_for(d)
    return r[r.port_id == int(port_id)]

def get_source_status():
    from src.daily_pipeline import source_check, freshness
    return {"sources": source_check(), "freshness": freshness()}
