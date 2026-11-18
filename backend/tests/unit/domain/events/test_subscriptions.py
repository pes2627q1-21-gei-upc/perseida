"""Subscriptions to an event in the domain (TG-53, criteris 1, 5 i 6)."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError as PydanticValidationError

from app.domain.events import errors as event_errors
from app.domain.events.models import EventSubscription
from app.domain.shared.errors import ConflictError
from tests.factories.events import make_event

NOW = datetime(2026, 11, 17, 21, 0, tzinfo=UTC)
USER_ID = uuid.UUID("01a1bd9a-0000-7000-8000-000000000001")
TICK = timedelta(microseconds=1)


def test_tg53_c5_error_codes_are_stable() -> None:
    # El frontend localitza aquests codis: no poden canviar.
    assert event_errors.EVENT_NOT_FOUND == "EVENT_NOT_FOUND"
    assert event_errors.EVENT_ALREADY_ENDED == "EVENT_ALREADY_ENDED"


def test_tg53_c1_create_builds_the_subscription_of_the_user_to_the_event() -> None:
    event = make_event(NOW + timedelta(days=1))

    subscription = EventSubscription.create(USER_ID, event, NOW)

    assert subscription.user_id == USER_ID
    assert subscription.event_id == event.id
    assert subscription.created_at == NOW


def test_tg53_c1_create_gives_a_uuid7_id() -> None:
    subscription = EventSubscription.create(USER_ID, make_event(NOW), NOW)

    assert isinstance(subscription.id, uuid.UUID)
    assert subscription.id.version == 7


def test_tg53_c1_each_subscription_gets_its_own_id() -> None:
    event = make_event(NOW)

    first = EventSubscription.create(USER_ID, event, NOW)
    second = EventSubscription.create(USER_ID, event, NOW)

    assert first.id != second.id


def test_tg53_c1_a_subscription_is_immutable() -> None:
    subscription = EventSubscription.create(USER_ID, make_event(NOW), NOW)

    with pytest.raises(PydanticValidationError):
        subscription.user_id = uuid.uuid7()  # type: ignore[misc]


def test_tg53_c5_create_allows_an_event_in_progress() -> None:
    event = make_event(NOW - timedelta(hours=1), NOW + timedelta(hours=1))

    assert EventSubscription.create(USER_ID, event, NOW).event_id == event.id


def test_tg53_c5_create_allows_an_event_ending_right_now() -> None:
    event = make_event(NOW - timedelta(hours=1), NOW)

    assert EventSubscription.create(USER_ID, event, NOW).event_id == event.id


def test_tg53_c5_create_refuses_an_event_that_has_ended() -> None:
    event = make_event(NOW - timedelta(hours=2), NOW - TICK)

    with pytest.raises(ConflictError) as exc_info:
        EventSubscription.create(USER_ID, event, NOW)

    assert exc_info.value.code == event_errors.EVENT_ALREADY_ENDED
