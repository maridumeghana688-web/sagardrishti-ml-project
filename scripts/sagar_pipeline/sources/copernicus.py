"""Copernicus Marine access via the official toolbox (import-guarded).

Subset = India bbox + time range + selected variables, all server-side.
Credentials come from the environment (Kaggle Secrets at runtime) and are
never printed, logged, or persisted.
"""
import os

from ..config import (
    LAT_MAX, LAT_MIN, LON_MAX, LON_MIN,
)
from ..errors import StageStop

# Credential names. The Toolbox itself reads COPERNICUSMARINE_SERVICE_*; the
# project also accepts the shorter COPERNICUS_* names and maps them over
# (memory only — values are never printed, logged, or persisted).
SECRET_USER_PRIMARY = "COPERNICUSMARINE_SERVICE_USERNAME"
SECRET_PASS_PRIMARY = "COPERNICUSMARINE_SERVICE_PASSWORD"
SECRET_USER_FALLBACK = "COPERNICUS_USERNAME"
SECRET_PASS_FALLBACK = "COPERNICUS_PASSWORD"

# Verified live 2026-09-26 against the current catalogue.
# MANDATORY enforced configuration: monthly-means dataset + surface only.
# Full-depth daily is FORBIDDEN (measured ~63GB vs 10GB budget).
VERIFIED_PRODUCT_ID = "GLOBAL_MULTIYEAR_PHY_001_030"
VERIFIED_DATASET_ID = "cmems_mod_glo_phy_my_0.083deg_P1M-m"
VERIFIED_VARIABLES = ["thetao", "so", "uo", "vo"]
SURFACE_DEPTH_MAX_M = 5.0


def _toolbox():
    try:
        import copernicusmarine  # noqa: F401
        import copernicusmarine as cm
        return cm
    except ImportError:
        raise StageStop(
            source="Copernicus Marine",
            error="The `copernicusmarine` toolbox is not installed here.",
            cause="Missing optional dependency.",
            required_action=("pip install copernicusmarine (the Kaggle notebook installs it), "
                            "then re-run."),
        )


def read_credentials() -> tuple:
    user = os.environ.get(SECRET_USER_PRIMARY, "") or os.environ.get(SECRET_USER_FALLBACK, "")
    password = os.environ.get(SECRET_PASS_PRIMARY, "") or os.environ.get(SECRET_PASS_FALLBACK, "")
    if not user or not password:
        raise StageStop(
            source="Copernicus Marine",
            error="Copernicus credentials are not configured.",
            cause=f"{SECRET_USER_PRIMARY}/{SECRET_USER_FALLBACK} and/or "
                  f"{SECRET_PASS_PRIMARY}/{SECRET_PASS_FALLBACK} is missing.",
            required_action=("Set the pair (Kaggle Secrets for notebook runs, .env locally), "
                            "then re-run stage 05."),
        )
    # Map onto the names the Toolbox reads natively (process memory only).
    os.environ[SECRET_USER_PRIMARY] = user
    os.environ[SECRET_PASS_PRIMARY] = password
    return user, password


def login():
    """Authenticate against the Marine Data Store. Returns nothing sensitive."""
    cm = _toolbox()
    user, password = read_credentials()
    try:
        cm.login(username=user, password=password, force_overwrite=True)
    except Exception as exc:
        raise StageStop(source="Copernicus Marine", error=f"Login failed: {exc}",
                        cause="Wrong credentials or service unreachable.",
                        required_action="Verify the account at marine.copernicus.eu and retry.")
    return True


def describe(dataset_id: str) -> dict:
    """Runtime metadata via the current toolbox object model (verified 2.4.1)."""
    cm = _toolbox()
    try:
        desc = cm.describe(dataset_id=dataset_id, disable_progress_bar=True)
        dump = desc.model_dump()
        prod = dump["products"][0]
        ds = prod["datasets"][0]
        return {"product_id": prod.get("product_id"), "dataset_id": ds.get("dataset_id"),
                "versions": ds.get("versions", [])}
    except Exception as exc:
        raise StageStop(source="Copernicus Marine", error=f"Describe failed: {exc}",
                        cause="Service or toolbox API change.",
                        required_action="Inspect copernicusmarine docs and update sources/copernicus.py.")


def enforce_surface_monthly(*, dataset_id: str, variables: list,
                            depth_max_m: float | None) -> None:
    """Hard gate: monthly-means dataset + 4 approved vars + surface only.

    Raises StageStop on ANY deviation. Never falls back to full-depth/daily.
    """
    if dataset_id != VERIFIED_DATASET_ID:
        raise StageStop(
            source="Copernicus Marine",
            error=f"Dataset {dataset_id} is not the approved monthly-means dataset.",
            cause="Full-depth daily (~63GB) is forbidden; only the verified P1M-m dataset is allowed.",
            required_action=f"Use dataset_id={VERIFIED_DATASET_ID}. No fallback permitted.",
        )
    extra = set(variables) - set(VERIFIED_VARIABLES)
    if extra:
        raise StageStop(source="Copernicus Marine",
                        error=f"Unapproved variables requested: {sorted(extra)}.",
                        cause="Only thetao/so/uo/vo may be transferred.",
                        required_action="Reduce the variable list and retry.")
    if depth_max_m is None or depth_max_m > SURFACE_DEPTH_MAX_M:
        raise StageStop(source="Copernicus Marine",
                        error=f"Depth max {depth_max_m}m exceeds surface limit ({SURFACE_DEPTH_MAX_M}m).",
                        cause="Full water-column download is forbidden.",
                        required_action="Request surface levels only and retry.")


def subset(*, dataset_id: str, variables: list, start: str, end: str,
           dest_dir: str, username: str, password: str, dry_run: bool = False,
           depth_max_m: float = SURFACE_DEPTH_MAX_M):
    """Server-side subset download. Enforcement runs BEFORE any transfer."""
    enforce_surface_monthly(dataset_id=dataset_id, variables=variables,
                            depth_max_m=depth_max_m)
    cm = _toolbox()
    try:
        return cm.subset(
            dataset_id=dataset_id,
            variables=variables,
            minimum_longitude=LON_MIN, maximum_longitude=LON_MAX,
            minimum_latitude=LAT_MIN, maximum_latitude=LAT_MAX,
            minimum_depth=0, maximum_depth=depth_max_m,
            start_datetime=start, end_datetime=end,
            username=username, password=password,
            output_directory=dest_dir,
            dry_run=dry_run, disable_progress_bar=True,
        )
    except Exception as exc:
        raise StageStop(source="Copernicus Marine", error=f"Subset failed: {exc}",
                        cause="Bad range, quota, or service change.",
                        required_action="Narrow the request and retry; check service status.")
