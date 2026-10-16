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
