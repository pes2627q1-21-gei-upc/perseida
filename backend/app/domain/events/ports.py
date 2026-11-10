import uuid
from collections.abc import Sequence
from datetime import datetime
from typing import Protocol

from app.domain.events.models import AstronomicalEvent, EventDraft, EventSourceName


class EventRepository(Protocol):
    """Stored astronomical events. Both list methods sort by ``starts_at``.

    ``start`` and ``end`` must be timezone-aware datetimes.
    """

    async def list_between(
        self, start: datetime, end: datetime
    ) -> list[AstronomicalEvent]:
        """Return the events that overlap ``[start, end)``.

        An event overlaps when ``starts_at < end`` and ``ends_at >= start``, so
        an instantaneous event at ``start`` is included.
        """
        ...

    async def list_starting_between(
        self, start: datetime, end: datetime
    ) -> list[AstronomicalEvent]:
        """Return the events with ``start <= starts_at < end``."""
        ...

    async def upsert_many(self, drafts: Sequence[EventDraft]) -> None:
        """Store ``drafts``. A draft already stored (same ``source`` and
        ``external_id``) updates its event and keeps its ``id``."""
        ...

    async def exists(self, event_id: uuid.UUID) -> bool:
        """Return whether an event with ``event_id`` is stored."""
        ...


class EventSource(Protocol):
    """An origin of events (ADR-0031): an external API, a computation or a
    catalog. ``ttl_seconds`` is how long its events stay fresh."""

    @property
    def name(self) -> EventSourceName: ...

    @property
    def ttl_seconds(self) -> int: ...

    async def fetch(self) -> list[EventDraft]:
        """Return the events the source knows now. Incomplete records are
        left out.

        Raises:
            ExternalServiceError: the source failed or cannot be called now.
        """
        ...
