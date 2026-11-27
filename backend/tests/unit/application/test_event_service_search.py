"""EventService.search: the filtered list of GET /api/events (TG-51, criteris 1-5).

The repository is the in-memory fake, which filters like the SQL one; the
clock is fixed, so "today" is deterministic.
"""

from datetime import UTC, date, datetime, timedelta, timezone

import pytest

from app.application.events.event_service import EventService
from app.domain.events.models import (
    AstronomicalEvent,
    EventCategory,
    EventSourceName,
    Location,
    Proximity,
)
from app.domain.shared.errors import ValidationError
from tests.factories.events import make_draft, make_event
from tests.fakes.cache import FakeCache
from tests.fakes.events import FakeEventRepository, FakeEventSource

NOW = datetime(2026, 11, 17, 21, 30, tzinfo=UTC)
TODAY = datetime(2026, 11, 17, tzinfo=UTC)
BARCELONA = Location(latitude=41.3874, longitude=2.1686)


def make_service(
    *events: AstronomicalEvent, now: datetime = NOW
) -> tuple[EventService, FakeEventRepository]:
    repository = FakeEventRepository(events)
    return EventService(repository, [], FakeCache(), now=lambda: now), repository


async def search(
    service: EventService,
    from_day: date | None = None,
    to_day: date | None = None,
    categories: list[EventCategory] | None = None,
    lat: float | None = None,
    lon: float | None = None,
    radius_km: float | None = None,
) -> list[AstronomicalEvent]:
    return await service.search(
        from_day=from_day,
        to_day=to_day,
        categories=[] if categories is None else categories,
        lat=lat,
        lon=lon,
        radius_km=radius_km,
    )


async def test_tg51_c1_without_filters_searches_today_and_the_next_30_days() -> None:
    service, repository = make_service()

    await search(service)

    [query] = repository.searches
    assert query.start == TODAY
    assert query.end == TODAY + timedelta(days=31)
    assert query.categories == frozenset()
    assert query.near is None


async def test_tg51_c1_today_is_the_utc_day_even_if_the_clock_is_not_utc() -> None:
    local_now = datetime(2026, 11, 18, 0, 30, tzinfo=timezone(timedelta(hours=1)))
    service, repository = make_service(now=local_now)

    await search(service)

    [query] = repository.searches
    assert query.start == TODAY


async def test_tg51_c1_only_to_searches_from_today() -> None:
    service, repository = make_service()

    await search(service, to_day=date(2026, 11, 20))

    [query] = repository.searches
    assert query.start == TODAY
    assert query.end == datetime(2026, 11, 21, tzinfo=UTC)


async def test_tg51_c1_to_is_included_until_the_end_of_that_day() -> None:
    last_minute = make_event(datetime(2026, 12, 14, 23, 59, tzinfo=UTC))
    next_midnight = make_event(datetime(2026, 12, 15, tzinfo=UTC))
    service, _ = make_service(next_midnight, last_minute)

    events = await search(
        service, from_day=date(2026, 12, 14), to_day=date(2026, 12, 14)
    )

    assert events == [last_minute]


async def test_tg51_c3_events_overlapping_the_range_are_included() -> None:
    from_day = datetime(2026, 12, 1, tzinfo=UTC)
    started_before = make_event(
        from_day - timedelta(days=2), from_day + timedelta(hours=3)
    )
    ended_before = make_event(
        from_day - timedelta(days=2), from_day - timedelta(hours=1)
    )
    service, _ = make_service(ended_before, started_before)

    events = await search(service, from_day=date(2026, 12, 1), to_day=date(2026, 12, 2))

    assert events == [started_before]


async def test_tg51_c1_categories_are_passed_to_the_repository() -> None:
    lunar = make_event(NOW, category=EventCategory.LUNAR)
    launch = make_event(NOW, category=EventCategory.LAUNCH)
    solar = make_event(NOW, category=EventCategory.SOLAR)
    service, repository = make_service(lunar, launch, solar)

    events = await search(
        service, categories=[EventCategory.LUNAR, EventCategory.LAUNCH]
    )

    [query] = repository.searches
    assert query.categories == frozenset({EventCategory.LUNAR, EventCategory.LAUNCH})
    assert set(events) == {lunar, launch}


async def test_tg51_c4_proximity_is_passed_with_a_default_radius_of_500_km() -> None:
    service, repository = make_service()

    await search(service, lat=BARCELONA.latitude, lon=BARCELONA.longitude)

    [query] = repository.searches
    assert query.near == Proximity(location=BARCELONA, radius_km=500)


async def test_tg51_c4_near_keeps_events_in_the_radius_and_without_location() -> None:
    # Barcelona-Madrid is about 505 km.
    madrid = make_event(NOW, location=Location(latitude=40.4168, longitude=-3.7038))
    girona = make_event(NOW, location=Location(latitude=41.9794, longitude=2.8214))
    everywhere = make_event(NOW)
    service, repository = make_service(madrid, girona, everywhere)

    events = await search(
        service, lat=BARCELONA.latitude, lon=BARCELONA.longitude, radius_km=100
    )

    [query] = repository.searches
    assert query.near == Proximity(location=BARCELONA, radius_km=100)
    assert set(events) == {girona, everywhere}


@pytest.mark.parametrize(
    "filters",
    [
        {"from_day": date(2026, 12, 15), "to_day": date(2026, 12, 14)},
        {"from_day": date(2026, 11, 17), "to_day": date(2027, 2, 16)},
        {"lat": 41.3874},
        {"lon": 2.1686},
        {"radius_km": 100},
    ],
    ids=["from-after-to", "over-90-days", "lat-only", "lon-only", "radius-only"],
)
async def test_tg51_c2_invalid_filters_raise_a_validation_error_without_searching(
    filters: dict[str, object],
) -> None:
    service, repository = make_service()

    with pytest.raises(ValidationError) as exc_info:
        await search(service, **filters)  # type: ignore[arg-type]

    assert exc_info.value.code == "VALIDATION_ERROR"
    assert repository.searches == []


async def test_tg51_c5_search_refreshes_a_stale_source_first() -> None:
    draft = make_draft(NOW)
    source = FakeEventSource(EventSourceName.LAUNCH_LIBRARY_2, 3600, [draft])
    repository = FakeEventRepository()
    cache = FakeCache()
    service = EventService(repository, [source], cache, now=lambda: NOW)

    await search(service)

    assert source.calls == 1
    assert repository.upserted == [draft]
    assert cache.ttls["events:launch_library_2"] == 3600
    assert len(repository.searches) == 1
