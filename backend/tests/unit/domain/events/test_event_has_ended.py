"""When an event has ended (TG-53, criteri 5): ``ends_at < now``."""

from datetime import UTC, datetime, timedelta

from hypothesis import given
from hypothesis import strategies as st

from tests.factories.events import make_event

NOW = datetime(2026, 11, 17, 21, 0, tzinfo=UTC)
TICK = timedelta(microseconds=1)


def test_tg53_c5_an_event_in_progress_has_not_ended() -> None:
    event = make_event(NOW - timedelta(hours=1), NOW + timedelta(hours=1))

    assert event.has_ended(NOW) is False


def test_tg53_c5_an_event_ending_right_now_has_not_ended() -> None:
    # Decisió: «ja ha acabat» vol dir ends_at < now.
    event = make_event(NOW - timedelta(hours=1), NOW)

    assert event.has_ended(NOW) is False


def test_tg53_c5_an_event_that_ended_a_microsecond_ago_has_ended() -> None:
    event = make_event(NOW - timedelta(hours=1), NOW - TICK)

    assert event.has_ended(NOW) is True


def test_tg53_c5_a_future_event_has_not_ended() -> None:
    event = make_event(NOW + timedelta(days=3))

    assert event.has_ended(NOW) is False


@given(
    ends_offset=st.timedeltas(min_value=timedelta(days=-3), max_value=timedelta(days=3))
)
def test_tg53_c5_has_ended_is_exactly_ends_at_before_now(
    ends_offset: timedelta,
) -> None:
    ends_at = NOW + ends_offset
    event = make_event(ends_at - timedelta(hours=2), ends_at)

    assert event.has_ended(NOW) is (ends_at < NOW)
