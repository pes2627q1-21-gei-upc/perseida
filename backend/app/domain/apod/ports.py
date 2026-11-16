from datetime import date
from typing import Protocol

from app.domain.apod.models import Apod


class ApodProvider(Protocol):
    """Source of Astronomy Pictures of the Day.

    How the data is obtained (NASA API, Redis cache, PostgreSQL) is the
    adapter's business, not part of this contract. Both methods are async.
    """

    async def get_today(self) -> Apod:
        """Return the APOD of the current day.

        Raises:
            ExternalServiceError: if the provider is unavailable and no cached
                data can be served (``app.application.shared.errors``).
        """
        ...

    async def get_by_date(self, day: date) -> Apod:
        """Return the APOD published on ``day``.

        The caller has already checked that ``day`` is within the valid range
        (see ``app.domain.apod.rules.ensure_requestable``).

        Raises:
            ExternalServiceError: if the provider is unavailable and no cached
                data can be served (``app.application.shared.errors``).
        """
        ...


class ApodRepository(Protocol):
    """Durable storage of the APODs already obtained, one per date."""

    async def get(self, day: date) -> Apod | None:
        """Return the stored APOD of ``day``, or None."""
        ...

    async def latest(self, until: date) -> Apod | None:
        """Return the most recent stored APOD up to ``until``, or None."""
        ...

    async def save(self, apod: Apod) -> None:
        """Store ``apod``; if its date is already stored, keep the first one."""
        ...
