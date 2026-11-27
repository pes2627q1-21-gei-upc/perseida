"""The SQL subscriptions repository satisfies its ports (TG-53, criteri 6).

The assignments are checked by mypy: the chat (#64) reads ``is_subscribed``
through its own ``EventSubscriptions`` port, never importing the events feature.
"""

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.domain.chat.ports import EventSubscriptions
from app.domain.events import ports
from app.infrastructure.events import subscription_repository


def test_tg53_c6_the_sql_repository_satisfies_both_ports() -> None:
    factory: async_sessionmaker[AsyncSession] = async_sessionmaker()
    repository = subscription_repository.SqlEventSubscriptionRepository(factory)
    for_events: ports.EventSubscriptionRepository = repository
    for_chat: EventSubscriptions = repository

    assert for_events is for_chat
