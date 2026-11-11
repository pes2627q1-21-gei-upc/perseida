from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.domain.shared.text import safe_https_url
from app.infrastructure.events.launch_library import LAUNCH_LIBRARY_URL


class EventsSettings(BaseSettings):
    """Event sources (ADR-0031). Launch Library 2 needs no API key."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    launch_library_url: str = LAUNCH_LIBRARY_URL
    events_connect_timeout_seconds: float = Field(default=3.0, gt=0)
    events_timeout_seconds: float = Field(default=10.0, gt=0)

    @field_validator("launch_library_url")
    @classmethod
    def _require_https(cls, value: str) -> str:
        url = safe_https_url(value)
        if url is None:
            raise ValueError("must be an https URL")
        return url
