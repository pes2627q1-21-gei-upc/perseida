from collections.abc import Iterable
from datetime import datetime

from app.domain.events.models import AstronomicalEvent


class FakeEventRepository:
    """In-memory EventRepository. Returns ``events`` and records each query."""

    def __init__(self, events: Iterable[AstronomicalEvent] = ()) -> None:
        self._events = list(events)
        self.between: list[tuple[datetime, datetime]] = []
        self.starting_between: list[tuple[datetime, datetime]] = []

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
