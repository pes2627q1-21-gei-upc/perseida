import uuid
from collections.abc import Iterable, Sequence
from datetime import datetime

from app.application.shared.errors import ExternalServiceError
from app.domain.events.models import AstronomicalEvent, EventDraft, EventSourceName


class FakeEventRepository:
    """In-memory EventRepository. Returns ``events`` and records each query."""

    def __init__(self, events: Iterable[AstronomicalEvent] = ()) -> None:
        self._events = list(events)
        self.between: list[tuple[datetime, datetime]] = []
        self.starting_between: list[tuple[datetime, datetime]] = []
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

    async def upsert_many(self, drafts: Sequence[EventDraft]) -> None:
        self.upserted.extend(drafts)

    async def exists(self, event_id: uuid.UUID) -> bool:
        return any(event.id == event_id for event in self._events)


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
