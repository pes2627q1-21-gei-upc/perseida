from datetime import datetime
from typing import Protocol

from app.domain.events.models import AstronomicalEvent


class EventRepository(Protocol):
    """Stored astronomical events. Both methods sort by ``starts_at``.

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
