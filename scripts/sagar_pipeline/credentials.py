"""Centralized credential loader.

Resolution order (values are never printed, logged, or persisted):
  METHOD 1: Kaggle UserSecretsClient (preferred; interactive secrets).
  METHOD 2: explicitly attached PRIVATE Kaggle dataset
            /kaggle/input/<slug>/  containing one file per credential.

If neither source yields a non-empty value, raise CredentialUnavailable
naming ONLY the secret (CREDENTIAL SOURCE UNAVAILABLE).
"""
import os

# Exact secret names (public identifiers — never the values).
SECRET_GFW_TOKEN = "GFW_API_TOKEN"
SECRET_CMEMS_USER = "COPERNICUSMARINE_SERVICE_USERNAME"
SECRET_CMEMS_PASS = "COPERNICUSMARINE_SERVICE_PASSWORD"

# Private dataset fallback (owner/slug resolved from Kaggle config at push time).
SECRETS_DATASET_SLUG = "sagardrishti-private-secrets"
DATASET_FILES = {
    SECRET_GFW_TOKEN: "gfw_api_token.txt",
    SECRET_CMEMS_USER: "copernicus_username.txt",
    SECRET_CMEMS_PASS: "copernicus_password.txt",
}


class CredentialUnavailable(Exception):
    """Raised when no credential source is available. Names only the secret."""

    def __init__(self, secret_name: str):
        self.secret_name = secret_name
        super().__init__(
            f"CREDENTIAL SOURCE UNAVAILABLE: {secret_name} "
            f"(Kaggle Secrets and private dataset both unavailable)"
        )


def _from_user_secrets(name: str) -> str:
    try:
        from kaggle_secrets import UserSecretsClient
        value = UserSecretsClient().get_secret(name)
    except Exception:
        return ""
    return (value or "").strip()


def _dataset_dir() -> str:
    return os.path.join("/kaggle", "input", SECRETS_DATASET_SLUG)


def _from_private_dataset(name: str) -> str:
    path = os.path.join(_dataset_dir(), DATASET_FILES[name])
    try:
        with open(path, encoding="utf-8") as f:
            return f.read().strip()
    except (OSError, KeyError):
        return ""


def get_secret(name: str) -> str:
    """Return the credential value or raise CredentialUnavailable.

    Callers must never print, log, or persist the return value.
    """
    if name not in DATASET_FILES:
        raise CredentialUnavailable(name)
    value = _from_user_secrets(name)
    if value:
        return value
    value = _from_private_dataset(name)
    if value:
        return value
    raise CredentialUnavailable(name)


def secret_present(name: str) -> bool:
    """Presence check that never exposes the value (for probes)."""
    try:
        return bool(get_secret(name))
    except CredentialUnavailable:
        return False
