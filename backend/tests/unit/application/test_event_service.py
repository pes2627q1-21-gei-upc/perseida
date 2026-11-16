import logging
from datetime import UTC, date, datetime, timedelta, timezone

import pytest

from app.application.events.event_service import EventService
from app.application.shared.errors import ExternalServiceError
from app.domain.events.models import EventSourceName
from tests.factories.events import make_draft, make_event
from tests.fakes.cache import FakeCache
from tests.fakes.events import FakeEventRepository, FakeEventSource

NOW = datetime(2026, 11, 17, 21, 30, tzinfo=UTC)
EVENT = make_event(NOW)


def make_service() -> tuple[EventService, FakeEventRepository]:
    repository = FakeEventRepository([EVENT])
    return EventService(repository, [], FakeCache(), now=lambda: NOW), repository


async def test_tg351_c1_active_on_a_date_queries_that_utc_day() -> None:
    service, repository = make_service()

    events = await service.active_on(date(2026, 12, 14))

    assert events == [EVENT]
    assert repository.between == [
        (datetime(2026, 12, 14, tzinfo=UTC), datetime(2026, 12, 15, tzinfo=UTC))
    ]


async def test_tg351_c1_active_without_a_date_queries_today_in_utc() -> None:
    service, repository = make_service()

    await service.active_on()

    assert repository.between == [
        (datetime(2026, 11, 17, tzinfo=UTC), datetime(2026, 11, 18, tzinfo=UTC))
    ]


async def test_tg351_c1_today_is_the_utc_day_even_if_the_clock_is_not_utc() -> None:
    repository = FakeEventRepository()
    local_now = datetime(2026, 11, 18, 0, 30, tzinfo=timezone(timedelta(hours=1)))
    service = EventService(repository, [], FakeCache(), now=lambda: local_now)

    await service.active_on()

    assert repository.between == [
        (datetime(2026, 11, 17, tzinfo=UTC), datetime(2026, 11, 18, tzinfo=UTC))
    ]


async def test_tg351_c2_upcoming_queries_events_starting_in_the_next_days() -> None:
    service, repository = make_service()

    events = await service.upcoming(7)

    assert events == [EVENT]
    assert repository.starting_between == [(NOW, NOW + timedelta(days=7))]


LAUNCH_TTL = 3600
DRAFT = make_draft(NOW)
KEY = "events:launch_library_2"


def make_refreshing_service(
    source: FakeEventSource,
) -> tuple[EventService, FakeEventRepository, FakeCache]:
    repository = FakeEventRepository([EVENT])
    cache = FakeCache()
    return EventService(repository, [source], cache, now=lambda: NOW), repository, cache


def launch_source(error: ExternalServiceError | None = None) -> FakeEventSource:
    return FakeEventSource(
        EventSourceName.LAUNCH_LIBRARY_2, LAUNCH_TTL, [DRAFT], error=error
    )


@pytest.mark.parametrize("query", ["active", "upcoming"])
async def test_tg50_c5_a_stale_source_is_fetched_stored_and_marked_fresh(
    query: str,
) -> None:
    source = launch_source()
    service, repository, cache = make_refreshing_service(source)

    events = await (service.active_on() if query == "active" else service.upcoming(7))

    assert events == [EVENT]
    assert source.calls == 1
    assert repository.upserted == [DRAFT]
    assert KEY in cache.values
    assert cache.ttls[KEY] == LAUNCH_TTL


async def test_tg50_c5_two_queries_in_a_row_fetch_the_source_once() -> None:
    source = launch_source()
    service, _, _ = make_refreshing_service(source)

    await service.active_on()
    await service.upcoming(7)

    assert source.calls == 1


async def test_tg50_c5_an_expired_mark_fetches_the_source_again() -> None:
    source = launch_source()
    service, _, cache = make_refreshing_service(source)
    await service.active_on()

    cache.expire(KEY)
    await service.active_on()

    assert source.calls == 2


async def test_tg50_c6_a_failing_source_serves_stored_events_and_logs(
    caplog: pytest.LogCaptureFixture,
) -> None:
    source = launch_source(ExternalServiceError("EVENT_SOURCE_UNAVAILABLE"))
    service, repository, _ = make_refreshing_service(source)

    with caplog.at_level(logging.WARNING):
        events = await service.active_on()

    assert events == [EVENT]
    assert repository.upserted == []
    assert "launch_library_2" in caplog.text
    assert "EVENT_SOURCE_UNAVAILABLE" in caplog.text


async def test_tg50_c6_a_failing_source_is_not_called_again_for_15_minutes() -> None:
    source = launch_source(ExternalServiceError("EVENT_SOURCE_UNAVAILABLE"))
    service, _, cache = make_refreshing_service(source)

    await service.active_on()
    await service.active_on()

    assert source.calls == 1
    assert cache.ttls[KEY] == 15 * 60


async def test_tg50_c6_one_failing_source_does_not_stop_the_others() -> None:
    failing = launch_source(ExternalServiceError("EVENT_SOURCE_UNAVAILABLE"))
    catalog_draft = make_draft(NOW, source=EventSourceName.CATALOG)
    working = FakeEventSource(EventSourceName.CATALOG, 86400, [catalog_draft])
    repository = FakeEventRepository()
    service = EventService(repository, [failing, working], FakeCache(), now=lambda: NOW)

    await service.upcoming(7)

    assert repository.upserted == [catalog_draft]
