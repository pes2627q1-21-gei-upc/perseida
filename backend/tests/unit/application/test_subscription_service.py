"""SubscriptionService with in-memory fakes (TG-53, criteris 2-5 i 9)."""

import json
import logging
import uuid
from datetime import UTC, datetime, timedelta

import pytest

from app.application.events import subscription_service
from app.application.shared.errors import ExternalServiceError
from app.domain.events import errors as event_errors
from app.domain.events.models import AstronomicalEvent, EventSubscription
from app.domain.realtime.models import chat_event_room, room_revocation_channel
from app.domain.shared.errors import ConflictError, NotFoundError
from tests.factories.events import make_event
from tests.fakes.event_subscriptions import InMemoryEventSubscriptionRepository
from tests.fakes.events import FakeEventRepository
from tests.fakes.pubsub import FakePubSub

NOW = datetime(2026, 11, 17, 21, 0, tzinfo=UTC)
ME = uuid.UUID("01a1bd9a-0000-7000-8000-000000000001")
OTHER = uuid.UUID("01a1bd9a-0000-7000-8000-000000000002")
UNKNOWN_EVENT = uuid.UUID("01a1bd9a-ffff-7000-8000-000000000000")
ME_SUB = "google-me"

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
        FakeEventRepository(events), subscriptions, FakePubSub(), now=lambda: NOW
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


async def test_tg53_c2_already_subscribed_to_an_ended_event_is_idempotent() -> None:
    # Decisió de la persona: la idempotència va abans que la comprovació
    # d'acabat; si ja hi estaves subscrit, PUT respon 200 i la subscripció es manté.
    service, subscriptions = _service(ENDED)
    existing = make_subscription(ME, ENDED, NOW - timedelta(days=2))
    await subscriptions.add(existing)

    created = await service.subscribe(ME, ENDED.id)

    assert created is False
    assert subscriptions.subscriptions == {(ME, ENDED.id): existing}


async def test_tg53_c5_an_ended_event_refuses_only_a_new_subscription() -> None:
    # Un altre usuari ja hi és subscrit; per a mi la subscripció seria nova: 409.
    service, subscriptions = _service(ENDED)
    await subscriptions.add(make_subscription(OTHER, ENDED, NOW - timedelta(days=2)))

    with pytest.raises(ConflictError) as exc_info:
        await service.subscribe(ME, ENDED.id)

    assert exc_info.value.code == event_errors.EVENT_ALREADY_ENDED
    assert await subscriptions.is_subscribed(ME, ENDED.id) is False


async def test_tg53_c5_the_clock_is_read_on_each_call() -> None:
    clock = [NOW - timedelta(days=1)]
    subscriptions = InMemoryEventSubscriptionRepository([IN_PROGRESS])
    service = subscription_service.SubscriptionService(
        FakeEventRepository([IN_PROGRESS]),
        subscriptions,
        FakePubSub(),
        now=lambda: clock[0],
    )
    assert await service.subscribe(ME, IN_PROGRESS.id) is True

    clock[0] = IN_PROGRESS.ends_at + timedelta(microseconds=1)
    with pytest.raises(ConflictError):
        await service.subscribe(OTHER, IN_PROGRESS.id)


async def test_tg53_c3_unsubscribe_removes_the_subscription() -> None:
    service, subscriptions = _service(UPCOMING)
    await service.subscribe(ME, UPCOMING.id)
    await service.subscribe(OTHER, UPCOMING.id)

    await service.unsubscribe(ME, UPCOMING.id, google_sub=ME_SUB)

    assert await subscriptions.is_subscribed(ME, UPCOMING.id) is False
    assert await subscriptions.is_subscribed(OTHER, UPCOMING.id) is True


async def test_tg53_c3_unsubscribe_without_a_subscription_is_a_no_op() -> None:
    service, subscriptions = _service(UPCOMING)

    await service.unsubscribe(ME, UPCOMING.id, google_sub=ME_SUB)
    await service.unsubscribe(ME, UPCOMING.id, google_sub=ME_SUB)

    assert subscriptions.subscriptions == {}


async def test_tg53_c3_unsubscribe_does_not_check_that_the_event_exists() -> None:
    service, _ = _service()

    await service.unsubscribe(ME, UNKNOWN_EVENT, google_sub=ME_SUB)


async def test_tg53_c3_unsubscribe_works_for_an_ended_event() -> None:
    service, subscriptions = _service(ENDED)
    await subscriptions.add(make_subscription(ME, ENDED, NOW - timedelta(days=2)))

    await service.unsubscribe(ME, ENDED.id, google_sub=ME_SUB)

    assert await subscriptions.is_subscribed(ME, ENDED.id) is False


class _OrderedPubSub(FakePubSub):
    """Records whether the user was still subscribed when something was published."""

    def __init__(self, subscriptions: InMemoryEventSubscriptionRepository) -> None:
        super().__init__()
        self._subscriptions = subscriptions
        self.still_subscribed: list[bool] = []

    async def publish(self, channel: str, message: str) -> None:
        self.still_subscribed.append(
            (ME, UPCOMING.id) in self._subscriptions.subscriptions
        )
        await super().publish(channel, message)


def _service_with(
    pubsub: FakePubSub, subscriptions: InMemoryEventSubscriptionRepository
) -> subscription_service.SubscriptionService:
    return subscription_service.SubscriptionService(
        FakeEventRepository([UPCOMING]), subscriptions, pubsub, now=lambda: NOW
    )


async def test_tg459_unsubscribe_announces_the_lost_chat_room_after_removing() -> None:
    subscriptions = InMemoryEventSubscriptionRepository([UPCOMING])
    pubsub = _OrderedPubSub(subscriptions)
    service = _service_with(pubsub, subscriptions)
    await service.subscribe(ME, UPCOMING.id)

    await service.unsubscribe(ME, UPCOMING.id, google_sub=ME_SUB)

    assert pubsub.published == [
        (
            room_revocation_channel(ME_SUB),
            json.dumps({"room": chat_event_room(UPCOMING.id)}),
        )
    ]
    assert pubsub.still_subscribed == [False]  # the removal came first


async def test_tg459_a_failed_announcement_keeps_the_unsubscription_and_is_logged(
    caplog: pytest.LogCaptureFixture,
) -> None:
    subscriptions = InMemoryEventSubscriptionRepository([UPCOMING])
    pubsub = FakePubSub()
    service = _service_with(pubsub, subscriptions)
    await service.subscribe(ME, UPCOMING.id)
    pubsub.fail(error=ExternalServiceError("PUBSUB_UNAVAILABLE"))

    with caplog.at_level(logging.WARNING):
        await service.unsubscribe(ME, UPCOMING.id, google_sub=ME_SUB)  # no raise

    assert await subscriptions.is_subscribed(ME, UPCOMING.id) is False
    assert any(r.levelno == logging.WARNING for r in caplog.records)


async def test_tg459_subscribing_announces_nothing() -> None:
    subscriptions = InMemoryEventSubscriptionRepository([UPCOMING])
    pubsub = FakePubSub()

    await _service_with(pubsub, subscriptions).subscribe(ME, UPCOMING.id)

    assert pubsub.published == []


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
