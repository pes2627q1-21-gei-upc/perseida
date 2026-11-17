import math
import uuid
from collections.abc import Iterable, Sequence
from datetime import datetime
from typing import TYPE_CHECKING

from app.application.shared.errors import ExternalServiceError
from app.domain.events.models import (
    AstronomicalEvent,
    EventDraft,
    EventSourceName,
    Location,
)

if TYPE_CHECKING:
    # Only an annotation: the tests that do not search keep importing the fake.
    from app.domain.events.models import EventQuery

# Mean Earth radius (IUGG). The fake measures on a sphere; PostGIS measures on
# the WGS 84 spheroid, so distances differ by up to ~0.5 %: keep test points
# far from the edge of the radius.
EARTH_RADIUS_KM = 6371.0088


def distance_km(a: Location, b: Location) -> float:
    """Great-circle (haversine) distance between ``a`` and ``b``."""
    lat1, lon1 = math.radians(a.latitude), math.radians(a.longitude)
    lat2, lon2 = math.radians(b.latitude), math.radians(b.longitude)
    h = (
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    )
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(h))


class FakeEventRepository:
    """In-memory EventRepository. Records each query.

    ``list_between`` and ``list_starting_between`` return every event as is;
    ``search`` filters them like the SQL repository (TG-51), with the haversine
    distance of ``distance_km`` instead of PostGIS.
    """

    def __init__(self, events: Iterable[AstronomicalEvent] = ()) -> None:
        self._events = list(events)
        self.between: list[tuple[datetime, datetime]] = []
        self.starting_between: list[tuple[datetime, datetime]] = []
        self.searches: list[EventQuery] = []
        self.upserted: list[EventDraft] = []

    async def list_between(
        self, start: datetime, end: datetime
    ) -> list[AstronomicalEvent]:
        self.between.append((start, end))
        return self._events

    async def list_starting_between(
        self, start: datetime, end: datetime
    ) -> list[AstronomicalEvent]:
        self.starting_between.append((start, end))
        return self._events

    async def search(self, query: EventQuery) -> list[AstronomicalEvent]:
        self.searches.append(query)
        found = [event for event in self._events if _matches(event, query)]
        return sorted(found, key=lambda event: (event.starts_at, event.id))

    async def upsert_many(self, drafts: Sequence[EventDraft]) -> None:
        self.upserted.extend(drafts)

    async def exists(self, event_id: uuid.UUID) -> bool:
        return any(event.id == event_id for event in self._events)


def _matches(event: AstronomicalEvent, query: EventQuery) -> bool:
    overlaps = event.starts_at < query.end and event.ends_at >= query.start
    in_category = not query.categories or event.category in query.categories
    near = query.near
    close = (
        near is None
        or event.location is None
        or distance_km(event.location, near.location) <= near.radius_km
    )
    return overlaps and in_category and close


class FakeEventSource:
    """EventSource that returns ``drafts``, or raises ``error``; counts calls."""

    def __init__(
        self,
        name: EventSourceName,
        ttl_seconds: int,
        drafts: Sequence[EventDraft] = (),
        error: ExternalServiceError | None = None,
    ) -> None:
        self.name = name
        self.ttl_seconds = ttl_seconds
        self._drafts = list(drafts)
        self.error = error
        self.calls = 0

    async def fetch(self) -> list[EventDraft]:
        self.calls += 1
        if self.error is not None:
            raise self.error
        return self._drafts
