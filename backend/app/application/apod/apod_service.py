from collections.abc import Callable
from datetime import UTC, date, datetime

from app.domain.apod.models import Apod
from app.domain.apod.ports import ApodProvider
from app.domain.apod.rules import ensure_requestable


def _utc_today() -> date:
    return datetime.now(UTC).date()


class ApodService:
    def __init__(
        self, provider: ApodProvider, today: Callable[[], date] = _utc_today
    ) -> None:
        self._provider = provider
        self._today = today

    async def get_apod(self, day: date | None = None) -> Apod:
        """Return the APOD of ``day``, or of today when no date is given.

        Raises:
            ValidationError: APOD_DATE_IN_FUTURE or APOD_DATE_BEFORE_START.
            ExternalServiceError: propagated from the provider.
        """
        if day is None:
            return await self._provider.get_today()
        ensure_requestable(day, self._today())
        return await self._provider.get_by_date(day)
