import uuid
from datetime import datetime
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

from app.domain.events.errors import EVENT_ALREADY_ENDED
from app.domain.shared.errors import ConflictError, ValidationError
from app.domain.shared.location import Location as Location


class EventCategory(StrEnum):
    """Kinds of astronomical event, fixed by TG-50 (task #387)."""

    LUNAR = "lunar"
    SOLAR = "solar"
    METEOR_SHOWER = "meteor_shower"
    LAUNCH = "launch"


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

    def has_ended(self, now: datetime) -> bool:
        """Return whether the event is over at ``now``: ``ends_at < now``.

        An event that ends exactly at ``now`` has not ended yet (TG-53).
        """
        return self.ends_at < now


class EventDraft(_EventData):
    """An event as a source gives it, before it is stored and gets an ``id``.

    ``(source, external_id)`` identifies it across fetches (TG-50, criterion 4).
    """

    source: EventSourceName
    external_id: Annotated[NonBlank, Field(max_length=EXTERNAL_ID_MAX_LENGTH)]


class EventSubscription(BaseModel):
    """A user follows an event (TG-53): at most one per user and event."""

    model_config = ConfigDict(frozen=True)

    id: uuid.UUID
    user_id: uuid.UUID
    event_id: uuid.UUID
    created_at: AwareDatetime

    @classmethod
    def create(
        cls, user_id: uuid.UUID, event: AstronomicalEvent, now: datetime
    ) -> Self:
        """Subscribe ``user_id`` to ``event`` at ``now``.

        Raises:
            ConflictError: ``EVENT_ALREADY_ENDED`` if the event has ended.
        """
        if event.has_ended(now):
            raise ConflictError(EVENT_ALREADY_ENDED, "Event has already ended")
        return cls(id=uuid.uuid7(), user_id=user_id, event_id=event.id, created_at=now)
