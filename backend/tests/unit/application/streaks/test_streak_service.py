import uuid
from datetime import UTC, date, datetime, timedelta, timezone

from app.application.streaks.streak_service import StreakService
from app.domain.streaks.models import DailyStreak
from tests.fakes.streaks import FakeStreakRepository

USER_ID = uuid.uuid4()


class _Clock:
    def __init__(self, instant: datetime) -> None:
        self.instant = instant

    def __call__(self) -> datetime:
        return self.instant


def _service(repo: FakeStreakRepository, clock: _Clock) -> StreakService:
    return StreakService(repo, now=clock)


# TG-56 criteri 1
async def test_first_activity_creates_streak_of_one() -> None:
    repo = FakeStreakRepository()
    clock = _Clock(datetime(2026, 11, 10, 12, 0, tzinfo=UTC))

    streak = await _service(repo, clock).register_activity(USER_ID)

    assert streak.current_count == 1
    assert streak.last_activity_date == date(2026, 11, 10)
    assert repo.streaks[USER_ID] == streak


# TG-56 criteri 2
async def test_activity_on_consecutive_day_increments_streak() -> None:
    repo = FakeStreakRepository()
    clock = _Clock(datetime(2026, 11, 10, 12, 0, tzinfo=UTC))
    service = _service(repo, clock)
    await service.register_activity(USER_ID)

    clock.instant = datetime(2026, 11, 11, 12, 0, tzinfo=UTC)
    streak = await service.register_activity(USER_ID)

    assert streak.current_count == 2
    assert streak.last_activity_date == date(2026, 11, 11)


# TG-56 criteri 3
async def test_second_activity_same_day_keeps_streak() -> None:
    repo = FakeStreakRepository()
    clock = _Clock(datetime(2026, 11, 10, 9, 0, tzinfo=UTC))
    service = _service(repo, clock)
    first = await service.register_activity(USER_ID)

    clock.instant = datetime(2026, 11, 10, 18, 0, tzinfo=UTC)
    second = await service.register_activity(USER_ID)

    assert second == first


async def test_activity_after_a_gap_restarts_streak() -> None:
    repo = FakeStreakRepository()
    clock = _Clock(datetime(2026, 11, 10, 12, 0, tzinfo=UTC))
    service = _service(repo, clock)
    await service.register_activity(USER_ID)

    clock.instant = datetime(2026, 11, 13, 12, 0, tzinfo=UTC)
    streak = await service.register_activity(USER_ID)

    assert streak.current_count == 1


async def test_existing_streak_is_updated_not_duplicated() -> None:
    existing = DailyStreak(
        id=uuid.uuid7(),
        user_id=USER_ID,
        current_count=5,
        last_activity_date=date(2026, 11, 9),
    )
    repo = FakeStreakRepository(existing)
    clock = _Clock(datetime(2026, 11, 10, 12, 0, tzinfo=UTC))

    streak = await _service(repo, clock).register_activity(USER_ID)

    assert streak.id == existing.id
    assert streak.current_count == 6
    assert len(repo.streaks) == 1


# TG-56 criteri 5: el dia és el dia UTC; la mitjanit UTC en marca el canvi
async def test_midnight_utc_starts_a_new_day() -> None:
    repo = FakeStreakRepository()
    clock = _Clock(datetime(2026, 11, 10, 23, 50, tzinfo=UTC))
    service = _service(repo, clock)
    await service.register_activity(USER_ID)

    clock.instant = datetime(2026, 11, 11, 0, 10, tzinfo=UTC)
    streak = await service.register_activity(USER_ID)

    assert streak.current_count == 2
    assert streak.last_activity_date == date(2026, 11, 11)


# TG-56 criteri 5: un instant amb un altre desfasament es converteix a UTC
async def test_clock_with_another_offset_is_converted_to_utc_day() -> None:
    repo = FakeStreakRepository()
    # 01:00 del dia 11 a UTC+2 són les 23:00 del dia 10 a UTC.
    clock = _Clock(datetime(2026, 11, 11, 1, 0, tzinfo=timezone(timedelta(hours=2))))

    streak = await _service(repo, clock).register_activity(USER_ID)

    assert streak.last_activity_date == date(2026, 11, 10)
