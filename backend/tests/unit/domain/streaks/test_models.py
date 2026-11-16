import uuid
from datetime import date, timedelta

import pytest

from app.domain.shared.errors import ValidationError
from app.domain.streaks.models import DailyStreak

TODAY = date(2026, 11, 10)
USER_ID = uuid.uuid4()


def _streak(count: int, last: date) -> DailyStreak:
    return DailyStreak(
        id=uuid.uuid4(), user_id=USER_ID, current_count=count, last_activity_date=last
    )


# TG-56 criteri 1: primer registre -> ratxa 1
def test_start_creates_streak_of_one_for_today() -> None:
    streak = DailyStreak.start(USER_ID, TODAY)

    assert streak.user_id == USER_ID
    assert streak.current_count == 1
    assert streak.last_activity_date == TODAY
    assert streak.id.version == 7


# TG-56 criteri 2: ahir -> +1
def test_register_activity_after_yesterday_increments_count() -> None:
    streak = _streak(3, TODAY - timedelta(days=1)).register_activity(TODAY)

    assert streak.current_count == 4
    assert streak.last_activity_date == TODAY


# TG-56 criteri 3: mateix dia dues vegades -> igual
def test_register_activity_same_day_changes_nothing() -> None:
    original = _streak(3, TODAY)

    assert original.register_activity(TODAY) == original


def test_register_activity_with_gap_restarts_at_one() -> None:
    streak = _streak(7, TODAY - timedelta(days=2)).register_activity(TODAY)

    assert streak.current_count == 1
    assert streak.last_activity_date == TODAY


def test_register_activity_keeps_identity_when_incrementing() -> None:
    original = _streak(2, TODAY - timedelta(days=1))
    updated = original.register_activity(TODAY)

    assert (updated.id, updated.user_id) == (original.id, original.user_id)


def test_register_activity_with_future_last_date_changes_nothing() -> None:
    original = _streak(5, TODAY + timedelta(days=1))

    assert original.register_activity(TODAY) == original


def test_count_on_same_day_returns_current_count() -> None:
    assert _streak(4, TODAY).count_on(TODAY) == 4


def test_count_on_day_after_last_activity_returns_current_count() -> None:
    assert _streak(4, TODAY - timedelta(days=1)).count_on(TODAY) == 4


def test_count_on_two_days_after_last_activity_returns_zero() -> None:
    assert _streak(4, TODAY - timedelta(days=2)).count_on(TODAY) == 0


# TG-56 invariant: current_count >= 1 validat al domini
@pytest.mark.parametrize("count", [0, -1, -3])
def test_streak_with_non_positive_count_is_rejected(count: int) -> None:
    with pytest.raises(ValidationError) as exc_info:
        _streak(count, TODAY)

    assert exc_info.value.code == "STREAK_COUNT_INVALID"


@pytest.mark.parametrize("count", [1, 2, 365])
def test_streak_with_positive_count_is_accepted(count: int) -> None:
    assert _streak(count, TODAY).current_count == count
