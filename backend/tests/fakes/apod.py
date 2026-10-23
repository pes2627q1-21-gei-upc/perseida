from collections.abc import Iterable
from datetime import date

from app.domain.apod.models import Apod


class FakeApodProvider:
    """In-memory ApodProvider. Records the dates it was asked for."""

    def __init__(
        self,
        apods: Iterable[Apod],
        today: date,
        failure: Exception | None = None,
    ) -> None:
        self._by_date = {apod.apod_date: apod for apod in apods}
        self._today = today
        self._failure = failure
        self.requested: list[date | None] = []

    async def get_today(self) -> Apod:
        self.requested.append(None)
        if self._failure is not None:
            raise self._failure
        return self._by_date[self._today]

    async def get_by_date(self, day: date) -> Apod:
        self.requested.append(day)
        if self._failure is not None:
            raise self._failure
        return self._by_date[day]


class FakeApodRepository:
    """In-memory stand-in for ``SqlApodRepository``."""

    def __init__(self, apods: Iterable[Apod] = ()) -> None:
        self.by_date = {apod.apod_date: apod for apod in apods}

    async def get(self, day: date) -> Apod | None:
        return self.by_date.get(day)

    async def latest(self, until: date) -> Apod | None:
        stored = [day for day in self.by_date if day <= until]
        return self.by_date[max(stored)] if stored else None

    async def save(self, apod: Apod) -> None:
        self.by_date.setdefault(apod.apod_date, apod)
