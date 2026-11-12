"""SkyfieldLunarSource with the de421 excerpt shipped in the repository.

Reference values: full and new moons from the USNO moon phases API, and the
lunar eclipses of 2026 (total on 3 March, partial on 28 August), checked on
2026-11-10.
"""

import asyncio
from datetime import UTC, date, datetime

import pytest

from app.application.shared.errors import ExternalServiceError
from app.domain.events.models import EventCategory, EventDraft, EventSourceName
from app.infrastructure.events.skyfield_source import (
    EPHEMERIS_PATH,
    SkyfieldLunarSource,
)

TODAY = date(2026, 11, 10)


@pytest.fixture(scope="module")
def drafts_2026_2027() -> list[EventDraft]:
    return asyncio.run(SkyfieldLunarSource(EPHEMERIS_PATH, lambda: TODAY).fetch())


def by_title(drafts: list[EventDraft], title: str) -> list[EventDraft]:
    return [draft for draft in drafts if draft.title == title]


def test_tg50_c3_full_and_new_moons_match_the_usno_to_the_minute(
    drafts_2026_2027: list[EventDraft],
) -> None:
    full = [d.starts_at for d in by_title(drafts_2026_2027, "Full Moon")]
    new = [d.starts_at for d in by_title(drafts_2026_2027, "New Moon")]

    assert datetime(2026, 11, 24, 14, 53, 34, tzinfo=UTC) in full
    assert datetime(2026, 11, 9, 7, 2, 7, tzinfo=UTC) in new
    assert len(full) + len(new) == 50


def test_tg50_c3_lunar_eclipses_of_this_year_and_the_next(
    drafts_2026_2027: list[EventDraft],
) -> None:
    eclipses = [d for d in drafts_2026_2027 if "Eclipse" in d.title]

    assert [(d.title, d.starts_at) for d in eclipses[:2]] == [
        ("Total Lunar Eclipse", datetime(2026, 3, 3, 11, 33, 41, tzinfo=UTC)),
        ("Partial Lunar Eclipse", datetime(2026, 8, 28, 4, 12, 53, tzinfo=UTC)),
    ]
    assert len(eclipses) == 5


def test_tg50_c3_lunar_events_are_instantaneous_and_seen_from_anywhere(
    drafts_2026_2027: list[EventDraft],
) -> None:
    for draft in drafts_2026_2027:
        assert draft.source is EventSourceName.SKYFIELD
        assert draft.category is EventCategory.LUNAR
        assert draft.ends_at == draft.starts_at
        assert draft.location is None
        assert draft.summary
        assert date(2026, 1, 1) <= draft.starts_at.date() < date(2028, 1, 1)


def test_tg50_c4_external_ids_are_stable_and_unique(
    drafts_2026_2027: list[EventDraft],
) -> None:
    ids = [draft.external_id for draft in drafts_2026_2027]

    assert "full_moon:2026-11-24T14:53:34Z" in ids
    assert "lunar_eclipse:2026-03-03T11:33:41Z" in ids
    assert len(ids) == len(set(ids))


async def test_tg50_c6_years_outside_the_ephemeris_are_an_external_service_error() -> (
    None
):
    source = SkyfieldLunarSource(EPHEMERIS_PATH, lambda: date(2031, 6, 1))

    with pytest.raises(ExternalServiceError) as exc_info:
        await source.fetch()

    assert exc_info.value.code == "EVENT_SOURCE_UNAVAILABLE"


def test_tg50_c5_lunar_events_stay_fresh_for_a_day() -> None:
    source = SkyfieldLunarSource(EPHEMERIS_PATH, lambda: TODAY)

    assert source.name is EventSourceName.SKYFIELD
    assert source.ttl_seconds == 24 * 3600
