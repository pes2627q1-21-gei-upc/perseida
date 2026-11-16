"""Catalog of the main meteor showers, versioned in the repository (ADR-0031).

``data/meteor_showers.json`` holds the nine main showers of each year, copied
from Table 5 (Working List of Visual Meteor Showers) of the IMO Meteor Shower
Calendar of that year. A ZHR given as "80+" is stored as 80. Add a year by
copying its calendar; the dates of a shower change from year to year.
"""

import asyncio
import json
import logging
from datetime import UTC, date, datetime, time
from pathlib import Path
from typing import Any

from pydantic import BaseModel
from pydantic import ValidationError as PydanticValidationError

from app.domain.events.models import EventCategory, EventDraft, EventSourceName
from app.domain.shared.errors import DomainError
from app.domain.shared.text import safe_https_url

logger = logging.getLogger(__name__)

CATALOG_PATH = Path(__file__).resolve().parent / "data" / "meteor_showers.json"
_LAST_SECOND = time(23, 59, 59)


class _Shower(BaseModel):
    code: str
    name: str
    year: int
    start: date
    end: date
    peak: date
    zhr: int
    source_url: str


def _day_month(day: date) -> str:
    return f"{day.day} {day:%B}"


def _summary(shower: _Shower) -> str:
    return (
        f"{shower.name} meteor shower, active from {_day_month(shower.start)} to "
        f"{_day_month(shower.end)}. Peak on {_day_month(shower.peak)} "
        f"{shower.peak.year}, with up to about {shower.zhr} meteors per hour "
        "under a dark sky (ZHR)."
    )


def _to_draft(entry: dict[str, Any]) -> EventDraft | None:
    """Return the draft of ``entry``, or None (logged) if it is incomplete."""
    try:
        shower = _Shower.model_validate(entry)
        return EventDraft(
            source=EventSourceName.CATALOG,
            external_id=f"{shower.code}-{shower.year}",
            title=f"{shower.name} {shower.year}",
            summary=_summary(shower),
            category=EventCategory.METEOR_SHOWER,
            starts_at=datetime.combine(shower.start, time.min, tzinfo=UTC),
            ends_at=datetime.combine(shower.end, _LAST_SECOND, tzinfo=UTC),
            source_url=safe_https_url(shower.source_url),
        )
    except PydanticValidationError, DomainError:
        logger.warning("Discarded incomplete meteor shower %s", entry.get("code"))
        return None


class MeteorShowerCatalogSource:
    """Meteor showers from the catalog file. It never calls the network."""

    name = EventSourceName.CATALOG
    ttl_seconds = 24 * 3600

    def __init__(self, path: Path = CATALOG_PATH) -> None:
        self._path = path

    async def fetch(self) -> list[EventDraft]:
        text = await asyncio.to_thread(self._path.read_text, encoding="utf-8")
        entries: list[dict[str, Any]] = json.loads(text)
        return [draft for entry in entries if (draft := _to_draft(entry))]
