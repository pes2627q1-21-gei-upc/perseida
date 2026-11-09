from datetime import UTC, date, datetime, timedelta, timezone

from app.application.events.event_service import EventService
from tests.factories.events import make_event
from tests.fakes.events import FakeEventRepository

NOW = datetime(2026, 11, 17, 21, 30, tzinfo=UTC)
EVENT = make_event(NOW)


def make_service() -> tuple[EventService, FakeEventRepository]:
    repository = FakeEventRepository([EVENT])
    return EventService(repository, now=lambda: NOW), repository


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
    service = EventService(repository, now=lambda: local_now)

    await service.active_on()

    assert repository.between == [
        (datetime(2026, 11, 17, tzinfo=UTC), datetime(2026, 11, 18, tzinfo=UTC))
    ]


async def test_tg351_c2_upcoming_queries_events_starting_in_the_next_days() -> None:
    service, repository = make_service()

    events = await service.upcoming(7)

    assert events == [EVENT]
    assert repository.starting_between == [(NOW, NOW + timedelta(days=7))]
