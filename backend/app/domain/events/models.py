import uuid
from enum import StrEnum
from typing import Annotated, Self

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    model_validator,
)

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


class EventSourceName(StrEnum):
    """Where an event comes from (ADR-0031). Stored as ``source``."""

    LAUNCH_LIBRARY_2 = "launch_library_2"
    USNO = "usno"
    SKYFIELD = "skyfield"
    CATALOG = "catalog"


# Text without NUL: PostgreSQL rejects it, and one such row fails the batch.
NonBlank = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, pattern=r"^[^\x00]*$"),
]
# Length of the ``external_id`` column.
EXTERNAL_ID_MAX_LENGTH = 255


class _EventData(BaseModel):
    """Fields shared by a stored event and the draft a source returns.

    ``ends_at`` equals ``starts_at`` when the event is instantaneous (e.g. a
    full moon). ``location`` is None when it is visible from anywhere.
    """

    model_config = ConfigDict(frozen=True)

    title: NonBlank
    summary: NonBlank
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


class AstronomicalEvent(_EventData):
    """An astronomical event, from its start to its end."""

    id: uuid.UUID


class EventDraft(_EventData):
    """An event as a source gives it, before it is stored and gets an ``id``.

    ``(source, external_id)`` identifies it across fetches (TG-50, criterion 4).
    """

    source: EventSourceName
    external_id: Annotated[NonBlank, Field(max_length=EXTERNAL_ID_MAX_LENGTH)]
