"""Global Fishing Watch access via the official 4Wings v3 API.

Verified live against the official schema
(https://globalfishingwatch.org/our-apis/documentation/docs/v3/4wings/report):

  POST /v3/4wings/report  +  Authorization: Bearer <token>
  query: spatial-resolution, format, group-by, temporal-resolution,
         datasets[0], filters[0], date-range
  body:  {"geojson": <Polygon object>}   (NOT a stringified FeatureCollection)

Default dataset for vessel activity/traffic is the AIS Vessel Presence
dataset (all vessel types); fishing effort is available for fisheries work.
Dataset versions are resolved from live responses (currently :v4.0).

Policy: server-side polygon + temporal subset first, precise India mask
after. Size is estimated from a tiny probe before any download. Missing
token or a rejected request stops the stage — never a global pull.
"""
import os

from ..config import (
    LAT_MAX, LAT_MIN, LON_MAX, LON_MIN,
    SECRET_GFW, SECRET_GFW_FALLBACK,
)
from ..errors import StageStop

GATEWAY = "https://gateway.api.globalfishingwatch.org"
REPORT_PATH = "/v3/4wings/report"

# Verified live 2026-09-26: presence v4, effort dataset family confirmed in docs.
DATASET_PRESENCE = "public-global-presence:latest"
DATASET_EFFORT = "public-global-fishing-effort:latest"

# Tiny verification polygon: 2x2 deg box in the acquisition bounds (off Kochi).
VERIFY_POLYGON = {"type": "Polygon", "coordinates": [[[70.0, 8.0], [72.0, 8.0],
                    [72.0, 10.0], [70.0, 10.0], [70.0, 8.0]]]}


def read_token() -> str:
    token = os.environ.get(SECRET_GFW, "") or os.environ.get(SECRET_GFW_FALLBACK, "")
    if not token:
        raise StageStop(
            source="GFW",
            error="GFW credential is not configured.",
            cause=f"Neither {SECRET_GFW} nor {SECRET_GFW_FALLBACK} is set.",
            required_action=("Set the token (Kaggle Secrets for notebook runs, .env locally), "
                            "then re-run stage 03."),
        )
    return token


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def verify_report(token: str, session=None) -> dict:
    """Smallest authenticated proof: token valid + endpoint valid + 4Wings reachable.

    A 3-day ENTIRE/FLAG presence report over the tiny verification polygon
    (kilobytes). 401 => bad token; 422 detail names the bad field.
    """
    import requests

    http = session or requests.Session()
    params = {
        "spatial-resolution": "LOW",
        "format": "JSON",
        "group-by": "FLAG",
        "temporal-resolution": "ENTIRE",
        "datasets[0]": DATASET_PRESENCE,
        "date-range": "2024-01-01,2024-01-03",
    }
    try:
        r = http.post(GATEWAY + REPORT_PATH, params=params,
                      headers=_headers(token),
                      json={"geojson": VERIFY_POLYGON}, timeout=180)
    except Exception as exc:
        raise StageStop(source="GFW", error=f"4Wings report unreachable: {exc}",
                        cause="Network or gateway outage.",
                        required_action="Retry with network access.")
    if r.status_code == 401:
        raise StageStop(source="GFW", error="Token rejected (401).",
                        cause="Expired or revoked GFW API token.",
                        required_action="Renew the token and update the secret; never embed it in code.")
    if r.status_code == 429:
        raise StageStop(source="GFW", error="Concurrent report already running (429).",
                        cause="One report per user at a time.",
                        required_action="Wait for the running report (or fetch it via last-report) and retry.")
    if not r.ok:
        raise StageStop(source="GFW", error=f"Verification report HTTP {r.status_code}: {r.text[:200]}",
                        cause="Schema drift or bad request shape.",
                        required_action="Re-check the v3 report docs and update sources/gfw.py.")
    data = r.json()
    entries = data.get("entries", [])
    if not entries:
        raise StageStop(source="GFW", error="Verification report returned zero entries.",
                        cause="Dataset may not cover the window.",
                        required_action="Adjust the verification window and retry.")
    return data


def download_window(token: str, dataset: str, start: str, end: str,
                    polygon: dict, dest_path: str,
                    temporal_resolution: str = "MONTHLY",
                    group_by: str = "FLAG", session=None) -> str:
    """Download ONE gated window (caller loops over the approved range)."""
    import requests

    http = session or requests.Session()
    params = {
        "spatial-resolution": "LOW",
        "format": "CSV",
        "group-by": group_by,
        "temporal-resolution": temporal_resolution,
        "datasets[0]": dataset,
        "date-range": f"{start},{end}",
    }
    try:
        with http.post(GATEWAY + REPORT_PATH, params=params,
                       headers=_headers(token), json={"geojson": polygon},
                       timeout=900, stream=True) as r:
            r.raise_for_status()
            os.makedirs(os.path.dirname(os.path.abspath(dest_path)), exist_ok=True)
            with open(dest_path, "wb") as f:
                for chunk in r.iter_content(chunk_size=1 << 20):
                    if chunk:
                        f.write(chunk)
    except Exception as exc:
        raise StageStop(source="GFW", error=f"Window download failed: {exc}",
                        cause="Report timeout (>100s returns 524 — recover via last-report), quota, or network.",
                        required_action="Use the last-report endpoint to recover, or narrow the window.")
    return dest_path


def india_bbox_polygon() -> dict:
    """Acquisition-bounds polygon (fetch window; the EEZ mask is applied after)."""
    return {"type": "Polygon", "coordinates": [[[LON_MIN, LAT_MIN], [LON_MAX, LAT_MIN],
             [LON_MAX, LAT_MAX], [LON_MIN, LAT_MAX], [LON_MIN, LAT_MIN]]]}
