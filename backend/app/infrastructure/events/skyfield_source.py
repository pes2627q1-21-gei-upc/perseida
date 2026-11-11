"""Full and new moons and lunar eclipses computed with Skyfield (ADR-0031).

The ephemeris is an excerpt of JPL DE421 (Sun, Earth, Moon and the Jupiter and
Saturn barycenters, December 2025 to January 2031), generated with::

    python -m jplephem excerpt --targets 3,5,6,10,301,399 2025/12/1 2031/2/1 \\
        https://ssd.jpl.nasa.gov/ftp/eph/planets/bsp/de421.bsp de421_2026_2030.bsp

Nothing is downloaded at run time: the time scale uses Skyfield's built-in data.
"""

import asyncio
from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

from jplephem.exceptions import OutOfRangeError
from skyfield import almanac, eclipselib
from skyfield.api import Loader, load_file
from skyfield.errors import EphemerisRangeError

from app.application.shared.errors import ExternalServiceError
from app.domain.events.models import EventCategory, EventDraft, EventSourceName

EPHEMERIS_PATH = Path(__file__).resolve().parent / "data" / "de421_2026_2030.bsp"

# Moon phases from ``almanac.MOON_PHASES``: 0 is new, 2 is full.
_PHASES = {
    0: ("new_moon", "New Moon", "The Moon is between the Earth and the Sun."),
    2: ("full_moon", "Full Moon", "The Moon is opposite the Sun, fully lit."),
}
_ECLIPSE_SUMMARY = "{kind} lunar eclipse, visible wherever the Moon is up."


def _utc_today() -> date:
    return datetime.now(UTC).date()


def _instant(event_id: str, title: str, summary: str, at: datetime) -> EventDraft:
    return EventDraft(
        source=EventSourceName.SKYFIELD,
        external_id=f"{event_id}:{at:%Y-%m-%dT%H:%M:%SZ}",
        title=title,
        summary=summary,
        category=EventCategory.LUNAR,
        starts_at=at,
        ends_at=at,
    )


def _to_utc(time: Any) -> datetime:
    """A Skyfield time, rounded to the second, as a UTC datetime."""
    moment: datetime = time.utc_datetime()
    return (moment + timedelta(microseconds=500_000)).replace(microsecond=0)


class SkyfieldLunarSource:
    """Lunar events of this year and the next, computed locally."""

    name = EventSourceName.SKYFIELD
    ttl_seconds = 24 * 3600

    def __init__(
        self,
        ephemeris_path: Path = EPHEMERIS_PATH,
        today: Callable[[], date] = _utc_today,
    ) -> None:
        self._ephemeris = load_file(str(ephemeris_path))
        self._timescale = Loader(str(ephemeris_path.parent)).timescale(builtin=True)
        self._today = today

    async def fetch(self) -> list[EventDraft]:
        year = self._today().year
        try:
            # CPU-bound (about half a second): off the event loop.
            return await asyncio.to_thread(self._compute, year, year + 2)
        # Skyfield and jplephem (used by eclipselib) raise their own error.
        except (EphemerisRangeError, OutOfRangeError) as exc:
            raise ExternalServiceError(
                "EVENT_SOURCE_UNAVAILABLE",
                f"The ephemeris does not cover {year}-{year + 1}",
            ) from exc

    def _compute(self, first_year: int, end_year: int) -> list[EventDraft]:
        start = self._timescale.utc(first_year, 1, 1)
        end = self._timescale.utc(end_year, 1, 1)
        times, phases = almanac.find_discrete(
            start, end, almanac.moon_phases(self._ephemeris)
        )
        drafts = [
            _instant(*_PHASES[int(phase)], _to_utc(moment))
            for moment, phase in zip(times, phases, strict=True)
            if int(phase) in _PHASES
        ]
        times, kinds, _ = eclipselib.lunar_eclipses(start, end, self._ephemeris)
        for moment, kind in zip(times, kinds, strict=True):
            name = eclipselib.LUNAR_ECLIPSES[int(kind)]
            drafts.append(
                _instant(
                    "lunar_eclipse",
                    f"{name} Lunar Eclipse",
                    _ECLIPSE_SUMMARY.format(kind=name),
                    _to_utc(moment),
                )
            )
        return sorted(drafts, key=lambda draft: draft.starts_at)
