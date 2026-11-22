from urllib.parse import urlsplit

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Spotwise serves only HTTP (contracte-spotwise.md); accepted by Raquel (TG-352).
SPOTWISE_URL = "http://nattech.fib.upc.edu:40420"


class SpotwiseSettings(BaseSettings):
    """Spotwise spaces service (TG-352). Without a token, the example spaces
    are served instead (mock)."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        # ``SPOTWISE_API_TOKEN=`` (the template) means "no token".
        env_ignore_empty=True,
    )

    spotwise_url: str = SPOTWISE_URL
    spotwise_api_token: SecretStr | None = None
    # Spotwise recommends 5 s.
    spotwise_timeout_seconds: float = Field(default=5.0, gt=0)

    @field_validator("spotwise_url")
    @classmethod
    def _require_http_url(cls, value: str) -> str:
        # Fails at startup instead of on every request (httpx.InvalidURL).
        url = urlsplit(value)
        if url.scheme not in ("http", "https") or not url.hostname:
            raise ValueError("must be an http or https URL with a host")
        return value
