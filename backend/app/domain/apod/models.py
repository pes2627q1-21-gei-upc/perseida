from datetime import date
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, field_validator

from app.domain.shared.errors import ValidationError
from app.domain.shared.text import safe_https_url


class MediaType(StrEnum):
    IMAGE = "image"
    VIDEO = "video"


class Apod(BaseModel):
    """NASA Astronomy Picture of the Day for one calendar date.

    ``apod_date`` is the natural key: there is one APOD per date.
    """

    model_config = ConfigDict(frozen=True)

    apod_date: date
    title: str
    explanation: str
    media_type: MediaType
    media_url: str
    copyright: str | None = None

    @field_validator("media_url")
    @classmethod
    def _require_https_media_url(cls, value: str) -> str:
        # The app loads this URL in an image or a WebView: only plain https.
        url = safe_https_url(value)
        if url is None:
            raise ValidationError(
                "APOD_MEDIA_URL_INVALID", "APOD media URL is not https"
            )
        return url
