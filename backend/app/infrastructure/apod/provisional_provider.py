from datetime import UTC, date, datetime

from app.domain.apod.models import Apod, MediaType


class ProvisionalApodProvider:
    """Placeholder ApodProvider: provisional until TG-46.

    Makes no external call and holds no real NASA data: it answers every
    request with a sample APOD dated as requested. TG-46 replaces it with the
    real adapter by changing ``get_apod_provider`` and deleting this file.
    """

    async def get_today(self) -> Apod:
        return self._sample(datetime.now(UTC).date())

    async def get_by_date(self, day: date) -> Apod:
        return self._sample(day)

    @staticmethod
    def _sample(day: date) -> Apod:
        return Apod(
            apod_date=day,
            title=f"Provisional APOD {day.isoformat()}",
            explanation="Sample data until the real provider (TG-46) is wired.",
            media_type=MediaType.IMAGE,
            media_url=f"https://example.com/apod/{day.isoformat()}.jpg",
        )
