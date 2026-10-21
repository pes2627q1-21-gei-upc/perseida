import logging
from collections.abc import Callable
from datetime import UTC, date, datetime
from typing import Protocol

from pydantic import TypeAdapter

from app.application.apod.errors import APOD_UNAVAILABLE
from app.application.shared.cache import get_or_load
from app.application.shared.errors import ExternalServiceError
from app.domain.apod.models import Apod
from app.domain.shared.ports import Cache
from app.infrastructure.apod.nasa_client import NasaApodClient, NasaApodError

logger = logging.getLogger(__name__)

APOD_TTL_SECONDS = 24 * 60 * 60

_APOD = TypeAdapter(Apod)


class ApodRepository(Protocol):
    """Storage of APODs used by the adapter (``SqlApodRepository``)."""

    async def get(self, day: date) -> Apod | None: ...

    async def latest(self, until: date) -> Apod | None: ...

    async def save(self, apod: Apod) -> None: ...


class _NotStoredError(Exception):
    """Nothing in PostgreSQL for the requested date."""


def _utc_today() -> date:
    return datetime.now(UTC).date()


def _key(day: date) -> str:
    return f"apod:{day.isoformat()}"


def _unavailable() -> ExternalServiceError:
    # Fixed message: it reaches the response ``detail`` (ADR-0018).
    return ExternalServiceError(APOD_UNAVAILABLE, "NASA APOD API unavailable")


class NasaApodProvider:
    """``ApodProvider`` that looks in Redis, then PostgreSQL, then the NASA API.

    What comes from the NASA is stored in PostgreSQL and cached for 24 h. If the
    NASA fails, stored data is served; with nothing stored, ExternalServiceError.
    """

    def __init__(
        self,
        client: NasaApodClient,
        cache: Cache,
        repository: ApodRepository,
        today: Callable[[], date] = _utc_today,
    ) -> None:
        self._client = client
        self._cache = cache
        self._repository = repository
        self._today = today

    async def get_by_date(self, day: date) -> Apod:
        return await get_or_load(
            self._cache, _key(day), lambda: self._load(day), _APOD, APOD_TTL_SECONDS
        )

    async def get_today(self) -> Apod:
        """Return today's APOD (UTC) or, until NASA publishes it, its latest one."""
        today = self._today()
        try:
            return await get_or_load(
                self._cache,
                _key(today),
                lambda: self._stored(today),
                _APOD,
                APOD_TTL_SECONDS,
            )
        except _NotStoredError:
            pass
        try:
            apod = await self._client.fetch()
        except NasaApodError:
            logger.warning("NASA APOD unavailable for today", exc_info=True)
            latest = await self._repository.latest(until=today)
            if latest is None:
                raise _unavailable() from None
            return latest
        # Cached under its own date: before NASA publishes, it is yesterday's.
        await self._repository.save(apod)
        await self._cache.set(
            _key(apod.apod_date), _APOD.dump_json(apod).decode(), APOD_TTL_SECONDS
        )
        return apod

    async def _stored(self, day: date) -> Apod:
        apod = await self._repository.get(day)
        if apod is None:
            raise _NotStoredError
        return apod

    async def _load(self, day: date) -> Apod:
        try:
            return await self._stored(day)
        except _NotStoredError:
            pass
        try:
            apod = await self._client.fetch(day)
        except NasaApodError:
            logger.warning("NASA APOD unavailable for %s", day, exc_info=True)
            raise _unavailable() from None
        await self._repository.save(apod)
        return apod
