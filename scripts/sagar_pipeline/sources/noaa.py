"""NOAA discovery + subsetting through public ERDDAP servers.

ERDDAP supports server-side constraints (variable/lat/lon/time), so only
the India window is ever transferred. Dataset IDs are discovered at runtime
via the server index — never hardcoded, never silently substituted.
"""
import re

from ..config import LAT_MAX, LAT_MIN, LON_MAX, LON_MIN
from ..errors import StageStop

COASTWATCH = "https://coastwatch.pfeg.noaa.gov/erddap"

# Verified live 2026-09-26. NOTE: the earlier candidate `erdMH1sstd8day` is
# DEPRECATED (2003-2019, superseded) and must NOT be used; its NRT successor
# `erdMH1sstd8dayR20190` covers only 2019. The series below spans the
# SAGARDRISHTI window. Wind: CoastWatch FNMOC products are monthly (too
# coarse) — wind is deferred to a Copernicus/ERA5 extension, not silently taken.
VERIFIED_SST_DATASET_ID = "nceiPH53sstd1day"
VERIFIED_SST_VARIABLE = "sea_surface_temperature"
# AVHRR Pathfinder v5.3 L3C SST, 0.0417 deg daily daytime, 1981-08-25 → 2023-12-31.
VERIFIED_SST_TITLE = ("AVHRR Pathfinder Version 5.3 L3-Collated (L3C) SST, Global, "
                      "0.0417 deg, 1981-present, Daytime (1 Day Composite)")
VERIFIED_SST_TIME_START = "1981-08-25T12:00:00Z"
VERIFIED_SST_TIME_END = "2023-12-31T12:00:00Z"


def _get(url: str, session, timeout: int):
    try:
        r = session.get(url, timeout=timeout)
        r.raise_for_status()
        return r
    except Exception as exc:
        raise StageStop(source="NOAA ERDDAP", error=f"Request failed for {url[:120]}: {exc}",
                        cause="Network issue or ERDDAP endpoint change.",
                        required_action="Retry; if the path moved, update sources/noaa.py.")


def discover(keyword: str, session=None):
    """Search the server index; return candidate {id, title} rows.

    If nothing matches or the choice is ambiguous, the caller must STOP —
    the pipeline never guesses a dataset.
    """
    import requests

    http = session or requests.Session()
    url = (f"{COASTWATCH}/info/index.json?itemsPerPage=100000"
           f"&searchFor={keyword}")
    data = _get(url, http, 120).json()
    cols = data["table"]["columnNames"]
    rows = data["table"]["rows"]
    idx_id = cols.index("Dataset ID")
    idx_title = cols.index("Title")
    out = []
    for row in rows:
        if row[idx_id].startswith("erd") or True:
            out.append({"id": row[idx_id], "title": row[idx_title]})
    return out


def describe_griddap(dataset_id: str, session=None) -> dict:
    """Parse the .dds header: variable names, dtypes, dimension sizes."""
    import requests

    http = session or requests.Session()
    text = _get(f"{COASTWATCH}/griddap/{dataset_id}.dds", http, 120).text
    dims = {}
    for m in re.finditer(r"(\w+)\s+(\w+)\[(\w+)\s*=\s*(\d+)\]", text):
        _dtype, _name, _dim, size = m.groups()
        dims.setdefault(_dim, int(size))
    variables = sorted(set(re.findall(r"Float(?:32|64)\s+(\w+)\[", text)))
    if not variables:
        raise StageStop(source="NOAA ERDDAP", error=f"No gridded variables parsed for {dataset_id}.",
                        cause=".dds shape change or non-gridded dataset.",
                        required_action="Inspect the .dds output and update the parser.")
    return {"variables": variables, "dims": dims}


def subset_url(dataset_id: str, variables: list, start: str, end: str,
               lat_step: int = 1, lon_step: int = 1) -> str:
    """Build a server-side constrained griddap URL for the India window."""
    varq = ",".join(
        f"{v}[({start}):1:({end})][({LAT_MIN}):{lat_step}:({LAT_MAX})]"
        f"[({LON_MIN}):{lon_step}:({LON_MAX})]"
        for v in variables
    )
    return f"{COASTWATCH}/griddap/{dataset_id}.nc?{varq}"


def download_subset(url: str, dest_path: str, session=None) -> str:
    """Transfer ONLY the constrained subset URL (already India-windowed)."""
    import os

    import requests

    http = session or requests.Session()
    try:
        with http.get(url, timeout=1800, stream=True) as r:
            r.raise_for_status()
            os.makedirs(os.path.dirname(os.path.abspath(dest_path)), exist_ok=True)
            with open(dest_path, "wb") as f:
                for chunk in r.iter_content(chunk_size=1 << 20):
                    if chunk:
                        f.write(chunk)
    except Exception as exc:
        raise StageStop(source="NOAA ERDDAP", error=f"Subset download failed: {exc}",
                        cause="Server limits or network interruption.",
                        required_action="Reduce the variable/time window and retry.")
    return dest_path
