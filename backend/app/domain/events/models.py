import uuid
from collections.abc import Iterable
from datetime import UTC, date, datetime, time, timedelta
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


class EventDraft(_EventData):
    """An event as a source gives it, before it is stored and gets an ``id``.

    ``(source, external_id)`` identifies it across fetches (TG-50, criterion 4).
    """

    source: EventSourceName
    external_id: Annotated[NonBlank, Field(max_length=EXTERNAL_ID_MAX_LENGTH)]


# Filters of GET /api/events (TG-51).
DEFAULT_RANGE_DAYS = 30
MAX_RANGE_DAYS = 90
DEFAULT_RADIUS_KM = 500.0
MIN_RADIUS_KM = 1.0
MAX_RADIUS_KM = 20_000.0


class Proximity(BaseModel):
    """Events within ``radius_km`` of ``location``, measured on the Earth."""

    model_config = ConfigDict(frozen=True)

    location: Location
    radius_km: float = Field(ge=MIN_RADIUS_KM, le=MAX_RADIUS_KM)


def _utc_midnight(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=UTC)


def _proximity(
    lat: float | None, lon: float | None, radius_km: float | None
) -> Proximity | None:
    if lat is None and lon is None and radius_km is None:
        return None
    if lat is None or lon is None:
        raise ValidationError("VALIDATION_ERROR", "Proximity needs both lat and lon")
    return Proximity(
        location=Location(latitude=lat, longitude=lon),
        radius_km=DEFAULT_RADIUS_KM if radius_km is None else radius_km,
    )


class EventQuery(BaseModel):
    """What GET /api/events lists: the events that overlap ``[start, end)``.

    An empty ``categories`` takes them all. With ``near``, located events must
    be within its radius; events without a location are always included.
    """

    model_config = ConfigDict(frozen=True)

    start: AwareDatetime
    end: AwareDatetime
    categories: frozenset[EventCategory] = frozenset()
    near: Proximity | None = None

    @classmethod
    def from_filters(
        cls,
        *,
        today: date,
        from_day: date | None,
        to_day: date | None,
        categories: Iterable[EventCategory],
        lat: float | None,
        lon: float | None,
        radius_km: float | None,
    ) -> Self:
        """Build the query from the request filters (UTC days, ``to`` included).

        By default ``from`` is ``today`` and ``to`` is 30 days after ``from``.

        Raises:
            ValidationError: ``from`` is after ``to``, the range spans more than
                90 days, or the proximity is incomplete (``VALIDATION_ERROR``).
        """
        near = _proximity(lat, lon, radius_km)
        first = today if from_day is None else from_day
        last = first + timedelta(days=DEFAULT_RANGE_DAYS) if to_day is None else to_day
        if first > last:
            raise ValidationError("VALIDATION_ERROR", "'from' is after 'to'")
        if (last - first).days > MAX_RANGE_DAYS:
            raise ValidationError(
                "VALIDATION_ERROR", f"The range spans more than {MAX_RANGE_DAYS} days"
            )
        return cls(
            start=_utc_midnight(first),
            end=_utc_midnight(last + timedelta(days=1)),
            categories=frozenset(categories),
            near=near,
        )
