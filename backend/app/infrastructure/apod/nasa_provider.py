import logging
from collections.abc import Callable
from datetime import UTC, date, datetime

from pydantic import TypeAdapter

from app.application.apod.errors import APOD_UNAVAILABLE
from app.application.shared.cache import get_or_load
from app.application.shared.errors import ExternalServiceError
from app.domain.apod.models import Apod
from app.domain.apod.ports import ApodRepository
from app.domain.shared.ports import Cache
from app.infrastructure.apod.nasa_client import NasaApodClient, NasaApodError

logger = logging.getLogger(__name__)

APOD_TTL_SECONDS = 24 * 60 * 60
# How long a NASA answer that may change soon is kept: today's APOD before NASA
# publishes it, and a failure (the NASA is not called again until it expires).
RETRY_AFTER_SECONDS = 15 * 60

_APOD = TypeAdapter(Apod)


class _NotStoredError(Exception):
    """Nothing in PostgreSQL for the requested date."""


def _utc_today() -> date:
    return datetime.now(UTC).date()


def _key(day: date) -> str:
    return f"apod:{day.isoformat()}"


def _today_key(day: date) -> str:
    return f"apod:today:{day.isoformat()}"


def _failed_key(day: date | None) -> str:
    return f"apod:unavailable:{'latest' if day is None else day.isoformat()}"


def _unavailable() -> ExternalServiceError:
    # Fixed message: it reaches the response ``detail`` (ADR-0018).
    return ExternalServiceError(APOD_UNAVAILABLE, "NASA APOD API unavailable")


class NasaApodProvider:
    """``ApodProvider`` that looks in Redis, then PostgreSQL, then the NASA API.

    What comes from the NASA is stored in PostgreSQL and cached for 24 h. If the
    NASA fails, stored data is served; with nothing stored, ExternalServiceError.
    A failed NASA call is not repeated for ``RETRY_AFTER_SECONDS``.
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
        # Not published yet (or NASA down): kept briefly so that every request
        # does not call the NASA until today's APOD exists.
        return await get_or_load(
            self._cache,
            _today_key(today),
            lambda: self._latest(today),
            _APOD,
            RETRY_AFTER_SECONDS,
        )

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
            apod = await self._fetch(day)
        except NasaApodError:
            raise _unavailable() from None
        await self._repository.save(apod)
        return apod

    async def _latest(self, today: date) -> Apod:
        try:
            apod = await self._fetch(None)
        except NasaApodError:
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

    async def _fetch(self, day: date | None) -> Apod:
        """Call the NASA unless the same call failed less than 15 min ago."""
        failed = _failed_key(day)
        if await self._cache.get(failed) is not None:
            raise NasaApodError("NASA APOD failed recently, not retried yet")
        try:
            return await self._client.fetch(day)
        except NasaApodError:
            logger.warning(
                "NASA APOD unavailable for %s", day or "latest", exc_info=True
            )
            await self._cache.set(failed, "1", RETRY_AFTER_SECONDS)
            raise
