"""Ports of the events feature for subscriptions (TG-53, criteri 6).

The assignments are checked by mypy: the in-memory fake must satisfy the new
port and, through it, the ``EventSubscriptions`` port the chat (#64) uses.
"""

import inspect
import uuid
from datetime import UTC, datetime

from app.domain.chat.ports import EventSubscriptions
from app.domain.events import ports
from tests.factories.events import make_event
from tests.fakes.event_subscriptions import InMemoryEventSubscriptionRepository
from tests.fakes.events import FakeEventRepository

NOW = datetime(2026, 11, 17, 21, 0, tzinfo=UTC)
ME = uuid.UUID("01a1bd9a-0000-7000-8000-000000000001")


def test_tg53_c6_the_subscription_port_exposes_is_subscribed() -> None:
    port = ports.EventSubscriptionRepository

    for name in ("add", "remove", "is_subscribed", "list_events_of"):
        assert inspect.iscoroutinefunction(getattr(port, name)), name


def test_tg53_c5_the_event_repository_port_can_get_one_event() -> None:
    assert inspect.iscoroutinefunction(ports.EventRepository.get)


async def test_tg53_c6_the_fakes_satisfy_the_ports() -> None:
    event = make_event(NOW)
    events: ports.EventRepository = FakeEventRepository([event])
    subscriptions: ports.EventSubscriptionRepository = (
        InMemoryEventSubscriptionRepository([event])
    )
    for_chat: EventSubscriptions = subscriptions

    assert await events.get(event.id) == event
    assert await events.get(uuid.uuid7()) is None
    assert await for_chat.is_subscribed(ME, event.id) is False
