from collections.abc import Callable
from datetime import UTC, date, datetime, time, timedelta

from app.domain.events.models import AstronomicalEvent
from app.domain.events.ports import EventRepository


def _utc_now() -> datetime:
    return datetime.now(UTC)


class EventService:
    def __init__(
        self, repository: EventRepository, now: Callable[[], datetime] = _utc_now
    ) -> None:
        self._repository = repository
        self._now = now

    async def active_on(self, day: date | None = None) -> list[AstronomicalEvent]:
        """Return the events active on ``day`` (a UTC day), or today."""
        if day is None:
            day = self._now().astimezone(UTC).date()
        start = datetime.combine(day, time.min, tzinfo=UTC)
        return await self._repository.list_between(start, start + timedelta(days=1))

    async def upcoming(self, days: int) -> list[AstronomicalEvent]:
        """Return the events that start within the next ``days`` days."""
        now = self._now()
        return await self._repository.list_starting_between(
            now, now + timedelta(days=days)
        )
