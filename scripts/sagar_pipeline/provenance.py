"""Provenance helpers — every output carries its full lineage."""
from datetime import datetime, timezone

from .config import PROCESSING_VERSION


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def make_provenance(*, source, source_url, dataset_id, dataset_version,
                    spatial_bounds, temporal_bounds, variables,
                    license, attribution) -> dict:
    return {
        "source": source,
        "source_url": source_url,
        "dataset_id": dataset_id,
        "dataset_version": dataset_version,
        "download_timestamp": utc_now_iso(),
        "processing_version": PROCESSING_VERSION,
        "spatial_bounds": spatial_bounds,
        "temporal_bounds": temporal_bounds,
        "variables": variables,
        "license": license,
        "attribution": attribution,
    }
