"""Application settings loaded from environment variables.

All secrets / deployment-specific values come from the environment (or a
local `.env` file). Nothing is hardcoded here.
"""

from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Central backend configuration."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    APP_NAME: str = "SAGARDRISHTI"
    APP_ENV: str = "development"
    DEBUG: bool = True
    API_V1_PREFIX: str = "/api/v1"

    CORS_ORIGINS: str = Field(default="http://localhost:5173,http://localhost:3000")

    DATABASE_URL: str = Field(
        default="postgresql+psycopg2://sagardrishti:changeme_in_dotenv@localhost:5432/sagardrishti"
    )

    # ── Application authentication (JWT, stateless) ──
    # SECRET_KEY signs access tokens. The default is a development placeholder:
    # set a long random value in `.env` / deployment env. Production refuses
    # to boot with the placeholder (see app.core.security).
    SECRET_KEY: str = Field(default="change-me-in-dotenv")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    AUTH_PASSWORD_MIN_LENGTH: int = 10

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _allow_list_or_csv(cls, v: object) -> str:
        # Accept either a JSON list or a plain CSV string.
        if isinstance(v, list):
            return ",".join(v)
        return str(v)

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
