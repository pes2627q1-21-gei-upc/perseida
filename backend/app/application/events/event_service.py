import logging
from collections.abc import Callable, Sequence
from datetime import UTC, date, datetime, time, timedelta

from app.application.shared.errors import ExternalServiceError
from app.domain.events.models import AstronomicalEvent
from app.domain.events.ports import EventRepository, EventSource
from app.domain.shared.ports import Cache

logger = logging.getLogger(__name__)

# A failing source is left alone this long before it is called again (TG-50).
FAILURE_PAUSE_SECONDS = 15 * 60


def _utc_now() -> datetime:
    return datetime.now(UTC)


class EventService:
    """Astronomical events, fetched on demand from their sources (ADR-0031).

    Before each query, every source whose freshness mark in the cache
    (``events:<source>``) has expired is fetched and stored. PostgreSQL is the
    source of truth: a failing source never fails the query.
    """

    def __init__(
        self,
        repository: EventRepository,
        sources: Sequence[EventSource],
        cache: Cache,
        now: Callable[[], datetime] = _utc_now,
    ) -> None:
        self._repository = repository
        self._sources = sources
        self._cache = cache
        self._now = now

    async def active_on(self, day: date | None = None) -> list[AstronomicalEvent]:
        """Return the events active on ``day`` (a UTC day), or today."""
        await self._refresh()
        if day is None:
            day = self._now().astimezone(UTC).date()
        start = datetime.combine(day, time.min, tzinfo=UTC)
        return await self._repository.list_between(start, start + timedelta(days=1))

    async def upcoming(self, days: int) -> list[AstronomicalEvent]:
        """Return the events that start within the next ``days`` days."""
        await self._refresh()
        now = self._now()
        return await self._repository.list_starting_between(
            now, now + timedelta(days=days)
        )

    async def _refresh(self) -> None:
        for source in self._sources:
            key = f"events:{source.name}"
            if await self._cache.get(key) is not None:
                continue
            try:
                drafts = await source.fetch()
            except ExternalServiceError as exc:
                logger.warning(
                    "Event source %s failed (%s: %s); serving stored events",
                    source.name,
                    exc.code,
                    exc.message,
                )
                await self._cache.set(key, "failed", FAILURE_PAUSE_SECONDS)
                continue
            await self._repository.upsert_many(drafts)
            await self._cache.set(key, "fresh", source.ttl_seconds)
