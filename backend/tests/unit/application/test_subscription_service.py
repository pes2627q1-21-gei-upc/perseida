"""SubscriptionService with in-memory fakes (TG-53, criteris 2-5 i 9)."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest

from app.application.events import subscription_service
from app.domain.events import errors as event_errors
from app.domain.events.models import AstronomicalEvent, EventSubscription
from app.domain.shared.errors import ConflictError, NotFoundError
from tests.factories.events import make_event
from tests.fakes.event_subscriptions import InMemoryEventSubscriptionRepository
from tests.fakes.events import FakeEventRepository

NOW = datetime(2026, 11, 17, 21, 0, tzinfo=UTC)
ME = uuid.UUID("01a1bd9a-0000-7000-8000-000000000001")
OTHER = uuid.UUID("01a1bd9a-0000-7000-8000-000000000002")
UNKNOWN_EVENT = uuid.UUID("01a1bd9a-ffff-7000-8000-000000000000")

UPCOMING = make_event(NOW + timedelta(days=2))
IN_PROGRESS = make_event(NOW - timedelta(hours=1), NOW + timedelta(hours=1))
ENDING_NOW = make_event(NOW - timedelta(hours=1), NOW)
ENDED = make_event(NOW - timedelta(days=1), NOW - timedelta(microseconds=1))


def make_subscription(
    user_id: uuid.UUID, event: AstronomicalEvent, at: datetime
) -> EventSubscription:
    """A subscription made at ``at``, when ``event`` had not ended yet."""
    return EventSubscription.create(user_id, event, at)


def _service(
    *events: AstronomicalEvent,
) -> tuple[
    subscription_service.SubscriptionService, InMemoryEventSubscriptionRepository
]:
    subscriptions = InMemoryEventSubscriptionRepository(events)
    service = subscription_service.SubscriptionService(
        FakeEventRepository(events), subscriptions, now=lambda: NOW
    )
    return service, subscriptions


async def test_tg53_c2_first_subscribe_creates_the_subscription() -> None:
    service, subscriptions = _service(UPCOMING)

    created = await service.subscribe(ME, UPCOMING.id)

    assert created is True
    assert await subscriptions.is_subscribed(ME, UPCOMING.id) is True
    stored = subscriptions.subscriptions[(ME, UPCOMING.id)]
    assert stored.created_at == NOW


async def test_tg53_c2_subscribing_again_is_idempotent() -> None:
    service, subscriptions = _service(UPCOMING)
    await service.subscribe(ME, UPCOMING.id)
    first = subscriptions.subscriptions[(ME, UPCOMING.id)]

    created = await service.subscribe(ME, UPCOMING.id)

    assert created is False
    assert list(subscriptions.subscriptions) == [(ME, UPCOMING.id)]
    assert subscriptions.subscriptions[(ME, UPCOMING.id)] == first


async def test_tg53_c2_each_user_has_their_own_subscription() -> None:
    service, subscriptions = _service(UPCOMING)

    assert await service.subscribe(ME, UPCOMING.id) is True
    assert await service.subscribe(OTHER, UPCOMING.id) is True

    assert set(subscriptions.subscriptions) == {(ME, UPCOMING.id), (OTHER, UPCOMING.id)}


@pytest.mark.parametrize(
    "event", [IN_PROGRESS, ENDING_NOW], ids=["in-progress", "ends-now"]
)
async def test_tg53_c5_an_event_that_has_not_ended_yet_can_be_subscribed(
    event: AstronomicalEvent,
) -> None:
    service, subscriptions = _service(event)

    assert await service.subscribe(ME, event.id) is True
    assert await subscriptions.is_subscribed(ME, event.id) is True


async def test_tg53_c5_subscribing_to_an_unknown_event_is_not_found() -> None:
    service, subscriptions = _service(UPCOMING)

    with pytest.raises(NotFoundError) as exc_info:
        await service.subscribe(ME, UNKNOWN_EVENT)

    assert exc_info.value.code == event_errors.EVENT_NOT_FOUND
    assert subscriptions.subscriptions == {}


async def test_tg53_c5_subscribing_to_an_ended_event_is_a_conflict() -> None:
    service, subscriptions = _service(ENDED)

    with pytest.raises(ConflictError) as exc_info:
        await service.subscribe(ME, ENDED.id)

    assert exc_info.value.code == event_errors.EVENT_ALREADY_ENDED
    assert subscriptions.subscriptions == {}


async def test_tg53_c5_the_ended_check_goes_before_the_idempotency() -> None:
    # Decisió del test (pla TG-53): si ja hi estaves subscrit i l'esdeveniment
    # ha acabat, PUT respon 409 i no 200; la subscripció es manté.
    service, subscriptions = _service(ENDED)
    await subscriptions.add(
        make_subscription(ME, ENDED, NOW - timedelta(days=2)),
    )

    with pytest.raises(ConflictError) as exc_info:
        await service.subscribe(ME, ENDED.id)

    assert exc_info.value.code == event_errors.EVENT_ALREADY_ENDED
    assert await subscriptions.is_subscribed(ME, ENDED.id) is True


async def test_tg53_c5_the_clock_is_read_on_each_call() -> None:
    clock = [NOW - timedelta(days=1)]
    subscriptions = InMemoryEventSubscriptionRepository([IN_PROGRESS])
    service = subscription_service.SubscriptionService(
        FakeEventRepository([IN_PROGRESS]), subscriptions, now=lambda: clock[0]
    )
    assert await service.subscribe(ME, IN_PROGRESS.id) is True

    clock[0] = IN_PROGRESS.ends_at + timedelta(microseconds=1)
    with pytest.raises(ConflictError):
        await service.subscribe(OTHER, IN_PROGRESS.id)


async def test_tg53_c3_unsubscribe_removes_the_subscription() -> None:
    service, subscriptions = _service(UPCOMING)
    await service.subscribe(ME, UPCOMING.id)
    await service.subscribe(OTHER, UPCOMING.id)

    await service.unsubscribe(ME, UPCOMING.id)

    assert await subscriptions.is_subscribed(ME, UPCOMING.id) is False
    assert await subscriptions.is_subscribed(OTHER, UPCOMING.id) is True


async def test_tg53_c3_unsubscribe_without_a_subscription_is_a_no_op() -> None:
    service, subscriptions = _service(UPCOMING)

    await service.unsubscribe(ME, UPCOMING.id)
    await service.unsubscribe(ME, UPCOMING.id)

    assert subscriptions.subscriptions == {}


async def test_tg53_c3_unsubscribe_does_not_check_that_the_event_exists() -> None:
    service, _ = _service()

    await service.unsubscribe(ME, UNKNOWN_EVENT)


async def test_tg53_c3_unsubscribe_works_for_an_ended_event() -> None:
    service, subscriptions = _service(ENDED)
    await subscriptions.add(make_subscription(ME, ENDED, NOW - timedelta(days=2)))

    await service.unsubscribe(ME, ENDED.id)

    assert await subscriptions.is_subscribed(ME, ENDED.id) is False


async def test_tg53_c4_list_mine_returns_only_my_events_by_start() -> None:
    later = make_event(NOW + timedelta(days=5))
    sooner = make_event(NOW + timedelta(days=1))
    not_mine = make_event(NOW + timedelta(days=3))
    service, _ = _service(later, sooner, not_mine)
    await service.subscribe(ME, later.id)
    await service.subscribe(ME, sooner.id)
    await service.subscribe(OTHER, not_mine.id)

    assert await service.list_mine(ME) == [sooner, later]


async def test_tg53_c4_list_mine_includes_the_ended_events() -> None:
    service, subscriptions = _service(ENDED, UPCOMING)
    await subscriptions.add(make_subscription(ME, ENDED, NOW - timedelta(days=2)))
    await service.subscribe(ME, UPCOMING.id)

    assert await service.list_mine(ME) == [ENDED, UPCOMING]


async def test_tg53_c4_list_mine_without_subscriptions_is_empty() -> None:
    service, _ = _service(UPCOMING)

    assert await service.list_mine(ME) == []
