"""Pipeline-wide configuration. Secrets are NEVER read here as values —
callers fetch them from the environment at the point of use and must
never print, log, or persist them.
"""
import os

# Acquisition bounds only (NOT the final maritime mask). From .env when set.
LAT_MIN = float(os.environ.get("LAT_MIN", "0"))
LAT_MAX = float(os.environ.get("LAT_MAX", "30"))
LON_MIN = float(os.environ.get("LON_MIN", "65"))
LON_MAX = float(os.environ.get("LON_MAX", "100"))

# Kaggle-side storage budget for final outputs (GB). Any stage whose
# estimate exceeds this MUST stop instead of downloading.
STORAGE_BUDGET_GB = float(os.environ.get("KAGGLE_STORAGE_BUDGET_GB", "10"))

# Working directory: /kaggle/working on Kaggle, data/work locally.
WORKDIR = os.environ.get("PIPELINE_WORKDIR", "data/work")

# Common historical window is DISCOVERED at runtime (stage 01); these are
# only fallback bounds if a source cannot report its own range.
FALLBACK_START = os.environ.get("PIPELINE_START", "2021-01-01")
FALLBACK_END = os.environ.get("PIPELINE_END", "2024-12-31")

PROCESSING_VERSION = "0.1.0"

STAGES = [
    "01_discover_sources",
    "02_estimate_sizes",
    "03_download_gfw",
    "04_download_noaa",
    "05_download_copernicus",
    "06_download_static_geodata",
    "07_filter_india",
    "08_clean",
    "09_spatiotemporal_align",
    "10_feature_engineering",
    "11_quality_control",
    "12_create_ml_datasets",
    "13_generate_reports",
]

# Credential names (values are only ever read, never displayed).
SECRET_GFW = "GFW_API_TOKEN"          # fallback accepted: GFW_API_KEY
SECRET_GFW_FALLBACK = "GFW_API_KEY"
# Copernicus names live in sources/copernicus.py
# (COPERNICUSMARINE_SERVICE_* → COPERNICUS_* fallback).
