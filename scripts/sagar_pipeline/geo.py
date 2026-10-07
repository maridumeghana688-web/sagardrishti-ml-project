"""India maritime spatial reference.

The rectangular acquisition bounds (config LAT/LON) are ONLY a first fetch
window. The authoritative mask is the Indian Exclusive Economic Zone polygon
(+ offshore buffer for approaches/traffic), fetched per-EEZ from the
Flanders Marine Institute MarineRegions gazetteer — i.e. India-only by
construction, never a hand-drawn polygon and never the bare rectangle.

Every filtered output records bbox-vs-mask counts so the mask's effect
beyond the rectangle is proven, not asserted.
"""
import json
import os

from .config import LON_MAX, LON_MIN, LAT_MAX, LAT_MIN
from .errors import StageStop

MARINEREGIONS_WFS = "https://geo.vliz.be/geoserver/MarineRegions/wfs"
EEZ_LAYER = "eez"
EEZ_NAME = "Indian Exclusive Economic Zone"
# Seaward buffer around the EEZ to cover port approaches + offshore lanes.
BUFFER_NM = 150
_M_PER_NM = 1852.0


def _need_shapely():
    try:
        from shapely.geometry import shape  # noqa: F401
        import shapely  # noqa: F401
        return True
    except ImportError:
        return False


def fetch_india_eez(dest_path: str, session=None) -> dict:
    """Resolve the Indian EEZ geometry via the documented MarineRegions WFS.

    GetFeature on the `eez` layer with a CQL name filter — India-only payload
    by construction, MRGID resolved at runtime (verified: 8480, sovereign
    India, 200NM). Raises StageStop if the service is unavailable — never
    falls back to an invented polygon.
    """
    import requests

    http = session or requests.Session()
    try:
        r = http.get(
            MARINEREGIONS_WFS,
            params={"service": "WFS", "version": "1.0.0", "request": "GetFeature",
                    "typeName": EEZ_LAYER,
                    "cql_filter": f"geoname='{EEZ_NAME}'",
                    "outputFormat": "application/json"},
            timeout=180,
        )
        r.raise_for_status()
        fc = r.json()
    except Exception as exc:
        raise StageStop(
            source="MarineRegions EEZ",
            error=f"EEZ WFS fetch failed: {exc}",
            cause="Network issue or MarineRegions WFS change (see marineregions.org/webservices.php).",
            required_action=("Retry with network access; if the service moved, update "
                            "MARINEREGIONS_WFS in scripts/sagar_pipeline/geo.py. "
                            "Do not substitute another boundary."),
        )
    feats = fc.get("features", [])
    if len(feats) != 1:
        raise StageStop(
            source="MarineRegions EEZ",
            error=f"Expected exactly 1 EEZ feature, got {len(feats)}.",
            cause="Gazetteer naming change or ambiguous filter.",
            required_action="Inspect the WFS response and tighten the CQL filter; do not invent a boundary.",
        )
    props = feats[0].get("properties", {})
    os.makedirs(os.path.dirname(os.path.abspath(dest_path)), exist_ok=True)
    with open(dest_path, "w", encoding="utf-8") as f:
        json.dump({"mrgid": props.get("mrgid"), "record": props,
                   "feature_collection": fc}, f)
    return {"mrgid": props.get("mrgid"), "record": props,
            "feature_collection": fc, "path": dest_path}


def build_india_mask(eez_bundle: dict):
    """EEZ polygon(s) + seaward buffer. Returns (mask_geometry, mask_metadata)."""
    if not _need_shapely():
        raise StageStop(
            source="India mask",
            error="shapely is not installed.",
            cause="Geometry engine missing in this environment.",
            required_action="pip install shapely geopandas (preinstalled on Kaggle).",
        )
    from shapely.geometry import shape
    from shapely.ops import unary_union

    geoms = eez_bundle.get("geometries") or []
    polys = []
    for item in geoms:
        g = item.get("geometry") or item.get("the_geom") or item
        try:
            polys.append(shape(g))
        except Exception:
            continue
    for feat in (eez_bundle.get("feature_collection") or {}).get("features", []):
        try:
            polys.append(shape(feat["geometry"]))
        except Exception:
            continue
    if not polys:
        raise StageStop(
            source="India mask",
            error="No usable polygons in the EEZ bundle.",
            cause="Empty or malformed geometry payload.",
            required_action="Re-run fetch_india_eez and inspect the cached bundle.",
        )
    eez = unary_union(polys)
    # Buffer in metres via a locally-centred azimuthal projection for correctness.
    import shapely.ops as ops

    centroid = eez.centroid
    proj_in = f"+proj=aeqd +lat_0={centroid.y} +lon_0={centroid.x} +datum=WGS84 +units=m"
    try:
        from shapely.ops import transform as shp_transform
        import pyproj

        to_m = pyproj.Transformer.from_crs("EPSG:4326", proj_in, always_xy=True).transform
        to_deg = pyproj.Transformer.from_crs(proj_in, "EPSG:4326", always_xy=True).transform
        mask = shp_transform(to_deg, shp_transform(to_m, eez).buffer(BUFFER_NM * _M_PER_NM))
    except ImportError:
        # pyproj missing: degree-space buffer is approximate — record it honestly.
        mask = eez.buffer(BUFFER_NM / 60.0)
        approx = True
    else:
        approx = False
    meta = {
        "mask": f"India EEZ (MarineRegions MRGID {eez_bundle.get('mrgid')}) + {BUFFER_NM}nm seaward buffer",
        "buffer_approximate": approx,
        "eez_area_deg2": float(eez.area),
        "mask_area_deg2": float(mask.area),
        "acquisition_bbox": [LON_MIN, LAT_MIN, LON_MAX, LAT_MAX],
    }
    return mask, meta


def apply_india_mask(df, lat_col: str, lon_col: str, mask):
    """Split a lat/lon table into bbox-windowed and mask-accepted row counts.

    Returns (accepted_df, stats) where stats prove the mask's effect beyond
    the rectangle: bbox_count vs mask_count.
    """
    if not _need_shapely():
        raise StageStop(
            source="India mask",
            error="shapely is not installed.",
            cause="Geometry engine missing in this environment.",
            required_action="pip install shapely geopandas (preinstalled on Kaggle).",
        )
    from shapely.geometry import Point

    in_bbox = (
        df[lon_col].between(LON_MIN, LON_MAX)
        & df[lat_col].between(LAT_MIN, LAT_MAX)
    )
    bbox_df = df[in_bbox]
    if bbox_df.empty:
        return bbox_df, {"bbox_count": 0, "mask_count": 0, "mask_fraction_of_bbox": 0.0}
    pts = [Point(xy) for xy in zip(bbox_df[lon_col].to_numpy(), bbox_df[lat_col].to_numpy())]
    keep = [mask.contains(pt) or mask.touches(pt) for pt in pts]
    accepted = bbox_df[keep].copy()
    stats = {
        "bbox_count": int(len(bbox_df)),
        "mask_count": int(len(accepted)),
        "mask_fraction_of_bbox": float(len(accepted) / len(bbox_df)),
    }
    return accepted, stats
