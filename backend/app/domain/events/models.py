import uuid
from enum import StrEnum
from typing import Self

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

from app.domain.shared.errors import ValidationError


class EventCategory(StrEnum):
    """Kinds of astronomical event, fixed by TG-50 (task #387)."""

    LUNAR = "lunar"
    SOLAR = "solar"
    METEOR_SHOWER = "meteor_shower"
    LAUNCH = "launch"


class Location(BaseModel):
    """A point on Earth (WGS 84 degrees)."""

    model_config = ConfigDict(frozen=True)

    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class AstronomicalEvent(BaseModel):
    """An astronomical event, from its start to its end.

    ``ends_at`` equals ``starts_at`` when the event is instantaneous (e.g. a
    full moon). ``location`` is None when it is visible from anywhere.
    """

    model_config = ConfigDict(frozen=True)

    id: uuid.UUID
    title: str
    summary: str
    category: EventCategory
    starts_at: AwareDatetime
    ends_at: AwareDatetime
    location: Location | None = None
    source_url: str | None = None

    @model_validator(mode="after")
    def _end_not_before_start(self) -> Self:
        if self.ends_at < self.starts_at:
            raise ValidationError(
                "EVENT_ENDS_BEFORE_START", "Event ends before it starts"
            )
        return self
