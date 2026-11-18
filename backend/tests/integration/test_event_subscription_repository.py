"""SqlEventSubscriptionRepository against PostgreSQL for real (TG-53, criteris 1,
2, 4, 6 i 9): uniqueness, concurrency, cascades and order.

Real commits (the concurrent test needs them). Each test cleans only its own
users and events, so the database is left as it was found.
"""

import asyncio
import os
import uuid
from collections.abc import AsyncIterator, Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from alembic.config import Config
from sqlalchemy import TextClause, text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from alembic import command
from app.domain.events.models import AstronomicalEvent, EventSubscription
from app.domain.users.models import User
from app.infrastructure.events import subscription_repository
from app.infrastructure.events.tables import AstronomicalEventRow
from app.infrastructure.persistence.config import DatabaseSettings
from app.infrastructure.users.repository import SqlUserRepository
from tests.factories.events import make_event
from tests.integration.isolation import row_counts

pytestmark = pytest.mark.skipif(
    not os.getenv("POSTGRES_HOST"),
    reason="PostgreSQL integration test requires POSTGRES_HOST",
)

NOW = datetime(2026, 11, 17, 21, 0, tzinfo=UTC)
PREFIX = "subscription-repo"
# Explicit, without relying on the cascades these tests check.
DELETE_OWN_ROWS = (
    text(
        "DELETE FROM event_subscriptions WHERE user_id IN"
        " (SELECT id FROM users WHERE email LIKE :prefix)"
    ),
    text(
        "DELETE FROM user_identities WHERE user_id IN"
        " (SELECT id FROM users WHERE email LIKE :prefix)"
    ),
    text("DELETE FROM users WHERE email LIKE :prefix"),
    text("DELETE FROM astronomical_events WHERE external_id LIKE :prefix"),
)
COUNT_OF_USER = text("SELECT count(*) FROM event_subscriptions WHERE user_id = :user")
COUNT_OF_EVENT = text(
    "SELECT count(*) FROM event_subscriptions WHERE event_id = :event"
)


@pytest.fixture(scope="module", autouse=True)
def _schema_at_head() -> None:
    backend_dir = Path(__file__).resolve().parents[2]
    config = Config(str(backend_dir / "alembic.ini"))
    config.set_main_option("script_location", str(backend_dir / "alembic"))
    config.attributes["configure_logger"] = False
    command.upgrade(config, "head")


@pytest.fixture(scope="module", autouse=True)
def _preexisting_data_is_kept(_schema_at_head: None) -> Iterator[None]:
    before = row_counts()
    yield
    assert row_counts() == before


@pytest.fixture
async def engine() -> AsyncIterator[AsyncEngine]:
    engine = create_async_engine(DatabaseSettings().database_url)
    try:
        yield engine
    finally:
        async with engine.begin() as connection:
            for statement in DELETE_OWN_ROWS:
                await connection.execute(statement, {"prefix": f"{PREFIX}-%"})
        await engine.dispose()


@pytest.fixture
def sessions(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, expire_on_commit=False)


@pytest.fixture
def repo(
    sessions: async_sessionmaker[AsyncSession],
) -> subscription_repository.SqlEventSubscriptionRepository:
    return subscription_repository.SqlEventSubscriptionRepository(sessions)


async def _user(sessions: async_sessionmaker[AsyncSession]) -> User:
    unique = f"{PREFIX}-{uuid.uuid4().hex}"
    return await SqlUserRepository(sessions).add(
        User.create(
            google_sub=f"sub-{unique}",
            email=f"{unique}@example.test",
            display_name="Ada",
        )
    )


async def _store(
    sessions: async_sessionmaker[AsyncSession],
    *events: AstronomicalEvent,
) -> None:
    async with sessions() as session:
        for event in events:
            session.add(
                AstronomicalEventRow(
                    id=event.id,
                    source="catalog",
                    external_id=f"{PREFIX}-{event.id}",
                    title=event.title,
                    summary=event.summary,
                    category=event.category.value,
                    starts_at=event.starts_at,
                    ends_at=event.ends_at,
                    latitude=None,
                    longitude=None,
                    source_url=event.source_url,
                )
            )
        await session.commit()


async def _event(
    sessions: async_sessionmaker[AsyncSession],
    starts_at: datetime = NOW + timedelta(days=1),
) -> AstronomicalEvent:
    event = make_event(starts_at)
    await _store(sessions, event)
    return event


def _subscription(user: User, event: AstronomicalEvent) -> EventSubscription:
    return EventSubscription.create(user.id, event, NOW)


async def _count(
    engine: AsyncEngine, statement: TextClause, **params: uuid.UUID
) -> int:
    async with engine.connect() as connection:
        return int(await connection.scalar(statement, params) or 0)


async def test_tg53_c2_add_creates_the_subscription_once(
    repo: subscription_repository.SqlEventSubscriptionRepository,
    sessions: async_sessionmaker[AsyncSession],
    engine: AsyncEngine,
) -> None:
    user, event = await _user(sessions), await _event(sessions)

    first = await repo.add(_subscription(user, event))
    second = await repo.add(_subscription(user, event))

    assert (first, second) == (True, False)
    assert await _count(engine, COUNT_OF_USER, user=user.id) == 1


async def test_tg53_c1_add_stores_the_id_and_created_at_of_the_subscription(
    repo: subscription_repository.SqlEventSubscriptionRepository,
    sessions: async_sessionmaker[AsyncSession],
    engine: AsyncEngine,
) -> None:
    user, event = await _user(sessions), await _event(sessions)
    subscription = _subscription(user, event)

    await repo.add(subscription)

    async with engine.connect() as connection:
        row = (
            await connection.execute(
                text(
                    "SELECT id, event_id, created_at FROM event_subscriptions"
                    " WHERE user_id = :user"
                ),
                {"user": user.id},
            )
        ).one()
    assert tuple(row) == (subscription.id, event.id, NOW)


async def test_tg53_c2_concurrent_adds_leave_a_single_row(
    repo: subscription_repository.SqlEventSubscriptionRepository,
    sessions: async_sessionmaker[AsyncSession],
    engine: AsyncEngine,
) -> None:
    user, event = await _user(sessions), await _event(sessions)

    results = await asyncio.gather(
        *(repo.add(_subscription(user, event)) for _ in range(5))
    )

    assert sorted(results) == [False, False, False, False, True]
    assert await _count(engine, COUNT_OF_USER, user=user.id) == 1


async def test_tg53_c6_is_subscribed_is_per_user_and_event(
    repo: subscription_repository.SqlEventSubscriptionRepository,
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    me, other = await _user(sessions), await _user(sessions)
    event, another = await _event(sessions), await _event(sessions)
    await repo.add(_subscription(me, event))

    assert await repo.is_subscribed(me.id, event.id) is True
    assert await repo.is_subscribed(other.id, event.id) is False
    assert await repo.is_subscribed(me.id, another.id) is False
    assert await repo.is_subscribed(me.id, uuid.uuid7()) is False


async def test_tg53_c3_remove_deletes_only_that_subscription(
    repo: subscription_repository.SqlEventSubscriptionRepository,
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    me, other = await _user(sessions), await _user(sessions)
    event, another = await _event(sessions), await _event(sessions)
    for user, target in ((me, event), (me, another), (other, event)):
        await repo.add(_subscription(user, target))

    await repo.remove(me.id, event.id)

    assert await repo.is_subscribed(me.id, event.id) is False
    assert await repo.is_subscribed(me.id, another.id) is True
    assert await repo.is_subscribed(other.id, event.id) is True


async def test_tg53_c3_remove_without_a_subscription_is_a_no_op(
    repo: subscription_repository.SqlEventSubscriptionRepository,
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    me = await _user(sessions)

    await repo.remove(me.id, uuid.uuid7())

    assert await repo.list_events_of(me.id) == []


async def test_tg53_c1_deleting_the_user_deletes_their_subscriptions(
    repo: subscription_repository.SqlEventSubscriptionRepository,
    sessions: async_sessionmaker[AsyncSession],
    engine: AsyncEngine,
) -> None:
    me, other = await _user(sessions), await _user(sessions)
    event = await _event(sessions)
    await repo.add(_subscription(me, event))
    await repo.add(_subscription(other, event))

    async with engine.begin() as connection:
        await connection.execute(
            text("DELETE FROM user_identities WHERE user_id = :user"), {"user": me.id}
        )
        await connection.execute(
            text("DELETE FROM users WHERE id = :user"), {"user": me.id}
        )

    assert await _count(engine, COUNT_OF_USER, user=me.id) == 0
    assert await repo.is_subscribed(other.id, event.id) is True


async def test_tg53_c1_deleting_the_event_deletes_its_subscriptions(
    repo: subscription_repository.SqlEventSubscriptionRepository,
    sessions: async_sessionmaker[AsyncSession],
    engine: AsyncEngine,
) -> None:
    me = await _user(sessions)
    event, kept = await _event(sessions), await _event(sessions)
    await repo.add(_subscription(me, event))
    await repo.add(_subscription(me, kept))

    async with engine.begin() as connection:
        await connection.execute(
            text("DELETE FROM astronomical_events WHERE id = :event"),
            {"event": event.id},
        )

    assert await _count(engine, COUNT_OF_EVENT, event=event.id) == 0
    assert await repo.list_events_of(me.id) == [kept]


async def test_tg53_c4_list_events_of_is_by_start_then_id_and_only_mine(
    repo: subscription_repository.SqlEventSubscriptionRepository,
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    me, other = await _user(sessions), await _user(sessions)
    later = make_event(NOW + timedelta(days=5))
    ended = make_event(NOW - timedelta(days=3), NOW - timedelta(days=2))
    same_start = sorted(
        (make_event(NOW + timedelta(days=1)) for _ in range(2)), key=lambda e: e.id
    )
    not_mine = make_event(NOW + timedelta(days=2))
    await _store(sessions, later, ended, *same_start, not_mine)
    # Added out of order: the order comes from the query, not from insertion.
    for event in (later, same_start[1], ended, same_start[0]):
        await repo.add(EventSubscription.create(me.id, event, NOW - timedelta(days=4)))
    await repo.add(_subscription(other, not_mine))

    assert await repo.list_events_of(me.id) == [ended, *same_start, later]


async def test_tg53_c4_list_events_of_without_subscriptions_is_empty(
    repo: subscription_repository.SqlEventSubscriptionRepository,
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    me = await _user(sessions)

    assert await repo.list_events_of(me.id) == []
