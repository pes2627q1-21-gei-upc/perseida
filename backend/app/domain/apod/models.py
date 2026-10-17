from datetime import date
from enum import StrEnum

from pydantic import BaseModel, ConfigDict


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
