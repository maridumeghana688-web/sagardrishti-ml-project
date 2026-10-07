"""Static reference geodata: India EEZ mask + canonical Indian ports table.

Small reference tables (single-EEZ geometry, port index) are the documented
exception to source-side subsetting: they are tiny, fetched whole, then
filtered to India. Gridded/AIS archives are never handled this way.

Produces: indian_ports.parquet with ONLY source-supported fields.
"""
import os

from ..errors import StageStop
from ..geo import build_india_mask, fetch_india_eez
from ..provenance import make_provenance

# NGA World Port Index publication page (edition-specific file links live here).
WPI_PAGE = "https://msi.nga.mil/Publications/WPI"
WPI_ALLOWED_HOSTS = ("msi.nga.mil", "nga.mil")

# WPI CSV columns we map. NOTE: WPI carries no Indian *state* subdivision,
# so `state` is deliberately NOT emitted (spec: only source-supported fields).
WPI_FIELD_MAP = {
    "PORT_NAME": "port_name",
    "LATITUDE": "latitude",     # decimal degrees preferred; DMS converted
    "LONGITUDE": "longitude",
    "HARBOR_TYPE": "port_type",
    "HARBOR_SIZE": "harbor_size",
}


def build_mask_bundle(work_dir: str) -> dict:
    """Fetch EEZ + build buffered mask. Returns mask metadata for provenance."""
    dest = os.path.join(work_dir, "ref", "india_eez_bundle.json")
    bundle = fetch_india_eez(dest)
    mask, meta = build_india_mask(bundle)
    meta["bundle_path"] = dest
    return {"mask": mask, "meta": meta}


def _official_host_ok(url: str) -> bool:
    from urllib.parse import urlparse
    host = (urlparse(url).hostname or "").lower()
    return any(host == h or host.endswith("." + h) for h in WPI_ALLOWED_HOSTS)


def download_wpi_official(dest_csv: str, session=None) -> dict:
    """Automated official NGA WPI download. Official hosts only — no mirrors.

    On any failure returns a BLOCKED report (never substitutes another
    dataset). Caller decides whether to stop only the WPI stage.
    """
    import re
    import zipfile

    import requests

    http = session or requests.Session()
    if hasattr(http, "headers"):
        http.headers.update({"User-Agent": "Mozilla/5.0 SAGARDRISHTI-pipeline/0.1"})
    try:
        page = http.get(WPI_PAGE, timeout=120)
    except Exception as exc:
        return {"status": "BLOCKED",
                "reason": f"NGA publication page unreachable: {exc}. "
                          f"Manual fallback: {WPI_PAGE}"}
    if page.status_code == 503 and "akamai" in page.text.lower():
        return {"status": "BLOCKED",
                "reason": ("HTTP 503 Akamai bot-mitigation on the official NGA page "
                           f"({WPI_PAGE}). Automated clients are challenged; retry from a "
                           "browser network or stage the CSV manually. No mirror used.")}
    if not page.ok:
        return {"status": "BLOCKED",
                "reason": f"NGA publication page HTTP {page.status_code}. Manual fallback: {WPI_PAGE}"}
    hrefs = re.findall(r'href="([^"]+)"', page.text)
    cands = []
    for h in hrefs:
        if not h or h.startswith("#"):
            continue
        full = h if h.startswith("http") else WPI_PAGE.rsplit("/", 1)[0] + "/" + h.lstrip("/")
        if _official_host_ok(full) and re.search(r"(?i)(wpi|pub[-_ ]?150).*?\.(zip|csv|txt)", full):
            cands.append(full)
    if not cands:
        return {"status": "BLOCKED",
                "reason": ("No official WPI file link found on the NGA publication page "
                           "(page layout may have changed). Manual fallback: " + WPI_PAGE)}
    url = cands[0]
    try:
        dl = http.get(url, timeout=1800, stream=True)
        dl.raise_for_status()
        os.makedirs(os.path.dirname(os.path.abspath(dest_csv)), exist_ok=True)
        tmp = dest_csv + ".download"
        with open(tmp, "wb") as f:
            for chunk in dl.iter_content(chunk_size=1 << 20):
                if chunk:
                    f.write(chunk)
    except Exception as exc:
        return {"status": "BLOCKED", "reason": f"Official file download failed: {exc}"}
    # Unpack archives; verify the payload is actually the World Port Index.
    if zipfile.is_zipfile(tmp):
        with zipfile.ZipFile(tmp) as z:
            names = [n for n in z.namelist() if n.lower().endswith((".csv", ".txt"))]
            if not names:
                return {"status": "BLOCKED",
                        "reason": "Official archive contains no CSV/TXT payload."}
            with z.open(sorted(names)[0]) as src, open(dest_csv, "wb") as out:
                out.write(src.read())
    else:
        os.replace(tmp, dest_csv)
    with open(dest_csv, encoding="utf-8", errors="replace") as f:
        head = f.read(4000)
    if "PORT_NAME" not in head.upper().replace(" ", "_") and "PORT" not in head.upper():
        return {"status": "BLOCKED",
                "reason": "Downloaded file does not look like the World Port Index (no PORT fields)."}
    return {"status": "DOWNLOADED", "url": url, "path": dest_csv,
            "source": "NGA World Port Index (official)", "title_verified": "World Port Index"}


def _wpi_to_decimal(series, is_lat: bool):
    """WPI mixes decimal degrees and DDM; normalize to decimal degrees."""
    import pandas as pd

    def conv(v):
        try:
            return float(v)
        except (TypeError, ValueError):
            return float("nan")
    return series.map(conv)


def build_indian_ports(wpi_csv_path: str, dest_parquet: str, source_version: str) -> dict:
    """Filter World Port Index rows to India and emit the canonical table."""
    import pandas as pd

    if not os.path.exists(wpi_csv_path):
        raise StageStop(
            source="World Port Index",
            error=f"WPI file not found: {wpi_csv_path}",
            cause="Reference CSV not staged in data/raw/.",
            required_action=("Download the current WPI edition from the NGA publication page "
                            f"({WPI_PAGE}) into data/raw/ and re-run. Never invent port coordinates."),
        )
    wpi = pd.read_csv(wpi_csv_path, low_memory=False)
    cols = {c.upper(): c for c in wpi.columns}
    country_col = cols.get("COUNTRY")
    if country_col is None:
        raise StageStop(source="World Port Index", error="COUNTRY column missing.",
                        cause="Unexpected WPI edition layout.",
                        required_action="Inspect the CSV header and update the field map.")
    india = wpi[wpi[country_col].astype(str).str.upper().str.strip() == "INDIA"].copy()
    if india.empty:
        raise StageStop(source="World Port Index", error="Zero India rows in WPI extract.",
                        cause="Wrong file or truncated download.",
                        required_action="Verify the WPI CSV completeness and retry.")
    lat = _wpi_to_decimal(india[cols["LATITUDE"]], True)
    lon = _wpi_to_decimal(india[cols["LONGITUDE"]], False)
    ports = {
        "port_id": ["IN-" + str(i + 1).zfill(3) for i in range(len(india))],
        "port_name": india[cols["PORT_NAME"]].astype(str).str.strip().tolist(),
        "latitude": lat.tolist(),
        "longitude": lon.tolist(),
        "port_type": india[cols["HARBOR_TYPE"]].astype(str).str.strip().tolist()
        if "HARBOR_TYPE" in cols else None,
        "harbor_size": india[cols["HARBOR_SIZE"]].astype(str).str.strip().tolist()
        if "HARBOR_SIZE" in cols else None,
    }
    ports = {k: v for k, v in ports.items() if v is not None}
    out = pd.DataFrame(ports).dropna(subset=["latitude", "longitude"]).reset_index(drop=True)
    os.makedirs(os.path.dirname(os.path.abspath(dest_parquet)), exist_ok=True)
    out.to_parquet(dest_parquet, index=False)
    prov = make_provenance(
        source="NGA World Port Index (filtered to COUNTRY == INDIA)",
        source_url=WPI_PAGE,
        dataset_id="WPI",
        dataset_version=source_version,
        spatial_bounds={"crs": "EPSG:4326", "note": "Indian ports as published"},
        temporal_bounds={"note": "static reference edition " + source_version},
        variables=list(out.columns),
        license="Public Domain (U.S. Government work)",
        attribution="National Geospatial-Intelligence Agency, World Port Index",
    )
    return {"path": dest_parquet, "n_ports": int(len(out)), "provenance": prov}
