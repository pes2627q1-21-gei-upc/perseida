from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.domain.shared.text import safe_https_url
from app.infrastructure.apod.nasa_client import APOD_URL
from app.infrastructure.apod.nasa_feed_client import FEED_URL


class NasaSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    nasa_api_key: SecretStr = Field(min_length=1)
    nasa_connect_timeout_seconds: float = Field(default=3.0, gt=0)
    nasa_timeout_seconds: float = Field(default=10.0, gt=0)
    # Feed first (APOD moved to science.nasa.gov); the JSON API is the fallback.
    nasa_apod_feed_url: str = FEED_URL
    nasa_apod_api_url: str = APOD_URL

    @field_validator("nasa_apod_feed_url", "nasa_apod_api_url")
    @classmethod
    def _require_https(cls, value: str) -> str:
        url = safe_https_url(value)
        if url is None:
            raise ValueError("must be an https URL")
        return url
