"""Rocket launches from Launch Library 2 (The Space Devs), ADR-0031."""

import asyncio
import logging
import time
from collections.abc import Callable
from typing import Any

import httpx
from pydantic import AwareDatetime, BaseModel
from pydantic import ValidationError as PydanticValidationError

from app.application.shared.errors import ExternalServiceError
from app.domain.events.models import (
    EventCategory,
    EventDraft,
    EventSourceName,
    Location,
)
from app.domain.shared.errors import DomainError
from app.domain.shared.text import safe_https_url

logger = logging.getLogger(__name__)

LAUNCH_LIBRARY_URL = "https://ll.thespacedevs.com/2.3.0/launches/upcoming/"
# The free tier allows 15 calls per hour; Perseida makes at most one (TG-50).
_MIN_SECONDS_BETWEEN_CALLS = 3600
# Launches per call: the next ones in date order, enough for the 30 days the
# API serves (``GET /api/events/upcoming`` accepts up to 30).
_PAGE_SIZE = 100


class _Mission(BaseModel):
    description: str | None = None


class _Pad(BaseModel):
    latitude: float | None = None
    longitude: float | None = None


class _Launch(BaseModel):
    """Fields of a launch that Perseida reads; the rest are ignored."""

    id: str
    url: str
    name: str
    window_start: AwareDatetime
    window_end: AwareDatetime
    mission: _Mission | None
    pad: _Pad | None = None


class _Page(BaseModel):
    results: list[dict[str, Any]]


def _location(pad: _Pad | None) -> Location | None:
    if pad is None or pad.latitude is None or pad.longitude is None:
        return None
    return Location(latitude=pad.latitude, longitude=pad.longitude)


def _to_draft(record: dict[str, Any]) -> EventDraft | None:
    """Return the draft of ``record``, or None (logged) if it is incomplete."""
    try:
        launch = _Launch.model_validate(record)
        return EventDraft(
            source=EventSourceName.LAUNCH_LIBRARY_2,
            external_id=launch.id,
            title=launch.name,
            summary=launch.mission.description if launch.mission else "",
            category=EventCategory.LAUNCH,
            starts_at=launch.window_start,
            ends_at=launch.window_end,
            location=_location(launch.pad),
            source_url=safe_https_url(launch.url),
        )
    except PydanticValidationError, DomainError:
        logger.warning("Discarded incomplete launch %s", record.get("id", "?"))
        return None


class LaunchLibraryEventSource:
    """Upcoming launches. One instance per process: it enforces the quota."""

    name = EventSourceName.LAUNCH_LIBRARY_2
    ttl_seconds = 3600

    def __init__(
        self,
        http: httpx.AsyncClient,
        url: str = LAUNCH_LIBRARY_URL,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._http = http
        self._url = url
        self._clock = clock
        self._lock = asyncio.Lock()
        self._last_call: float | None = None

    async def fetch(self) -> list[EventDraft]:
        async with self._lock:
            self._claim_call()
            page = await self._get_page()
        return [draft for record in page.results if (draft := _to_draft(record))]

    def _claim_call(self) -> None:
        """Count a call, or refuse it if the last one was less than an hour ago.

        The cache marks already space the calls; this holds even without Redis.
        """
        now = self._clock()
        if (
            self._last_call is not None
            and now - self._last_call < _MIN_SECONDS_BETWEEN_CALLS
        ):
            raise ExternalServiceError(
                "EVENT_SOURCE_QUOTA", "Launch Library 2 was called less than 1 h ago"
            )
        self._last_call = now

    async def _get_page(self) -> _Page:
        try:
            response = await self._http.get(
                self._url, params={"limit": _PAGE_SIZE, "mode": "normal"}
            )
            response.raise_for_status()
            return _Page.model_validate_json(response.content)
        except (httpx.HTTPError, PydanticValidationError) as exc:
            raise ExternalServiceError(
                "EVENT_SOURCE_UNAVAILABLE", f"Launch Library 2 failed: {exc}"
            ) from exc
