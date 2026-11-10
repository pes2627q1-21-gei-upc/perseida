"""Solar eclipses from the US Naval Observatory API (ADR-0031)."""

import logging
from collections.abc import Callable
from datetime import UTC, date, datetime, time
from typing import Any

import httpx
from pydantic import BaseModel
from pydantic import ValidationError as PydanticValidationError

from app.application.shared.errors import ExternalServiceError
from app.domain.events.models import EventCategory, EventDraft, EventSourceName
from app.domain.shared.errors import DomainError

logger = logging.getLogger(__name__)

USNO_SOLAR_URL = "https://aa.usno.navy.mil/api/eclipses/solar/year"
_SOURCE_URL = "https://aa.usno.navy.mil/data/SolarEclipses"
_LAST_SECOND = time(23, 59, 59)


class _Eclipse(BaseModel):
    year: int
    month: int
    day: int
    event: str


class _Year(BaseModel):
    eclipses_in_year: list[dict[str, Any]]


def _utc_today() -> date:
    return datetime.now(UTC).date()


def _to_draft(record: dict[str, Any]) -> EventDraft | None:
    """Return the draft of ``record``, or None (logged) if it is incomplete.

    The API gives only the date: the eclipse lasts its whole UTC day and has no
    location (ADR-0031).
    """
    try:
        eclipse = _Eclipse.model_validate(record)
        day = date(eclipse.year, eclipse.month, eclipse.day)
        return EventDraft(
            source=EventSourceName.USNO,
            external_id=f"solar:{day.isoformat()}",
            title=eclipse.event,
            summary=(
                f"{eclipse.event}. Where it can be seen and at what time "
                "depend on the observer's location."
            ),
            category=EventCategory.SOLAR,
            starts_at=datetime.combine(day, time.min, tzinfo=UTC),
            ends_at=datetime.combine(day, _LAST_SECOND, tzinfo=UTC),
            source_url=_SOURCE_URL,
        )
    except PydanticValidationError, DomainError, ValueError:
        logger.warning("Discarded incomplete solar eclipse %s", record)
        return None


class UsnoSolarEclipseSource:
    """Solar eclipses of this year and the next."""

    name = EventSourceName.USNO
    ttl_seconds = 24 * 3600

    def __init__(
        self,
        http: httpx.AsyncClient,
        url: str = USNO_SOLAR_URL,
        today: Callable[[], date] = _utc_today,
    ) -> None:
        self._http = http
        self._url = url
        self._today = today

    async def fetch(self) -> list[EventDraft]:
        year = self._today().year
        drafts: list[EventDraft] = []
        for asked in (year, year + 1):
            records = (await self._get_year(asked)).eclipses_in_year
            drafts += [draft for record in records if (draft := _to_draft(record))]
        return drafts

    async def _get_year(self, year: int) -> _Year:
        try:
            response = await self._http.get(self._url, params={"year": year})
            response.raise_for_status()
            return _Year.model_validate_json(response.content)
        except (httpx.HTTPError, PydanticValidationError) as exc:
            raise ExternalServiceError(
                "EVENT_SOURCE_UNAVAILABLE", f"USNO failed for {year}: {exc}"
            ) from exc
