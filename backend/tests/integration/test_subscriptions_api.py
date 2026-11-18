"""Subscriptions API with PostgreSQL and Redis for real (TG-53, criteri 9).

Only Google is simulated (respx + a throwaway RSA key); the app is wired as the
lifespan does it, with the real session store, user repository and the real
``event_subscriptions`` table. Everything runs inside one transaction per test
that is rolled back, so no row of this module is left behind.

Written after the code (accepted by the team): these tests do not go through red.
The clock is not frozen: the events are seeded relative to now (UTC).
"""

import os
import uuid
from collections.abc import AsyncIterator, Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx
import pytest
import respx
from alembic.config import Config
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient, Response
from redis.asyncio import Redis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncConnection,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from alembic import command
from app.application.auth.auth_service import AuthService, SessionDurations
from app.application.auth.errors import INVALID_SESSION
from app.infrastructure.auth.google_verifier import (
    GOOGLE_CERTS_URL,
    GoogleJwksVerifier,
)
from app.infrastructure.auth.jwt_codec import JwtTokenCodec
from app.infrastructure.auth.redis_session_store import RedisSessionStore
from app.infrastructure.cache.config import RedisSettings
from app.infrastructure.cache.redis_pubsub import RedisPubSub
from app.infrastructure.persistence.config import DatabaseSettings
from app.infrastructure.users.account_gateway import UserAccountGateway
from app.infrastructure.users.dependencies import build_user_service
from app.main import create_app
from tests.factories.google import CLIENT_ID, KEY, jwk, token
from tests.integration.isolation import row_counts

pytestmark = pytest.mark.skipif(
    not (os.getenv("POSTGRES_HOST") and os.getenv("REDIS_HOST")),
    reason="PostgreSQL and Redis integration test requires their hosts",
)

PROBLEM_JSON = "application/problem+json"
MINE = "/api/me/subscriptions"
# Redis database only for these tests (the app uses 0), emptied before and after.
TEST_REDIS_DB = 15
INSERT_EVENT = text(
    "INSERT INTO astronomical_events"
    " (id, source, external_id, title, summary, category, starts_at, ends_at)"
    " VALUES (:id, 'catalog', :external_id, :title, 'An astronomical event.',"
    " 'lunar', :starts_at, :ends_at)"
)
COUNT_SUBSCRIPTIONS = text(
    "SELECT count(*) FROM event_subscriptions"
    " WHERE user_id = :user_id AND event_id = :event_id"
)


def subscription(event_id: uuid.UUID | str) -> str:
    return f"/api/events/{event_id}/subscription"


@pytest.fixture(scope="module", autouse=True)
def _schema_at_head() -> None:
    backend_dir = Path(__file__).resolve().parents[2]
    config = Config(str(backend_dir / "alembic.ini"))
    config.set_main_option("script_location", str(backend_dir / "alembic"))
    config.attributes["configure_logger"] = False
    command.upgrade(config, "head")


@pytest.fixture
def google_certs() -> Iterator[respx.Route]:
    with respx.mock(assert_all_called=False) as mock:
        yield mock.get(GOOGLE_CERTS_URL).respond(json={"keys": [jwk(KEY, "k1")]})


@pytest.fixture(scope="module", autouse=True)
def _preexisting_data_is_kept(_schema_at_head: None) -> Iterator[None]:
    # The tests must leave the configured database as they found it.
    before = row_counts()
    yield
    assert row_counts() == before


@pytest.fixture
async def connection() -> AsyncIterator[AsyncConnection]:
    """One connection inside a transaction that is rolled back after the test."""
    engine = create_async_engine(DatabaseSettings().database_url)
    try:
        async with engine.connect() as connection:
            transaction = await connection.begin()
            try:
                yield connection
            finally:
                await transaction.rollback()
    finally:
        await engine.dispose()


@pytest.fixture
def factory(connection: AsyncConnection) -> async_sessionmaker[AsyncSession]:
    # Each commit of the app becomes a savepoint of the test's transaction.
    return async_sessionmaker(
        bind=connection,
        expire_on_commit=False,
        join_transaction_mode="create_savepoint",
    )


@pytest.fixture
async def redis() -> AsyncIterator[Redis]:
    """A Redis database only for these tests, emptied before and after."""
    client = Redis.from_url(
        RedisSettings().redis_url, db=TEST_REDIS_DB, decode_responses=True
    )
    try:
        await client.flushdb()
        yield client
    finally:
        await client.flushdb()
        await client.aclose()


@pytest.fixture
async def client(
    google_certs: respx.Route,
    factory: async_sessionmaker[AsyncSession],
    redis: Redis,
) -> AsyncIterator[AsyncClient]:
    users = build_user_service(factory)
    async with httpx.AsyncClient() as google:
        app: FastAPI = create_app()
        # The subscription service is built per request from this session factory
        # and the Redis of the app (the pub/sub that announces a lost chat room).
        app.state.session_factory = factory
        app.state.redis = redis
        app.state.user_service = users
        app.state.auth_service = AuthService(
            GoogleJwksVerifier(google, [CLIENT_ID]),
            JwtTokenCodec("s" * 40),
            RedisSessionStore(redis, RedisPubSub(redis)),
            UserAccountGateway(users),
            SessionDurations(access_seconds=900, refresh_seconds=2_592_000),
        )
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as http:
            yield http


async def login_headers(client: AsyncClient) -> dict[str, str]:
    sub = f"it-{uuid.uuid4().hex}"
    id_token = token(sub=sub, email=f"{sub}@example.test", name="Ana")
    response = await client.post("/api/auth/google", json={"id_token": id_token})
    tokens: dict[str, Any] = response.json()
    return {"Authorization": f"Bearer {tokens['access_token']}"}


async def user_id_of(client: AsyncClient, headers: dict[str, str]) -> uuid.UUID:
    response = await client.get("/api/users/me", headers=headers)
    return uuid.UUID(response.json()["id"])


async def seed_event(
    connection: AsyncConnection, *, starts_in: timedelta, lasts: timedelta
) -> uuid.UUID:
    """Store an event starting ``starts_in`` from now; return its id."""
    event_id = uuid.uuid7()
    starts_at = datetime.now(UTC) + starts_in
    await connection.execute(
        INSERT_EVENT,
        {
            "id": event_id,
            "external_id": f"it-subscriptions-{event_id}",
            "title": f"Event {event_id}",
            "starts_at": starts_at,
            "ends_at": starts_at + lasts,
        },
    )
    return event_id


async def subscriptions_count(
    connection: AsyncConnection, user_id: uuid.UUID, event_id: uuid.UUID
) -> int:
    rows = await connection.execute(
        COUNT_SUBSCRIPTIONS, {"user_id": user_id, "event_id": event_id}
    )
    return int(rows.scalar_one())


def assert_problem(response: Response, status: int, code: str) -> None:
    assert response.status_code == status
    assert response.headers["content-type"].startswith(PROBLEM_JSON)
    assert response.json()["code"] == code


async def upcoming(connection: AsyncConnection, days: int = 2) -> uuid.UUID:
    return await seed_event(
        connection, starts_in=timedelta(days=days), lasts=timedelta(hours=2)
    )


async def ended(connection: AsyncConnection) -> uuid.UUID:
    return await seed_event(
        connection, starts_in=-timedelta(days=2), lasts=timedelta(hours=2)
    )


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("PUT", subscription(uuid.uuid7())),
        ("DELETE", subscription(uuid.uuid7())),
        ("GET", MINE),
    ],
    ids=["put", "delete", "list"],
)
async def test_tg53_c5_subscription_endpoints_without_a_token_are_401(
    client: AsyncClient, method: str, path: str
) -> None:
    # testing.md: endpoints privats sense sessio -> 100 % rebutjats
    response = await client.request(method, path)

    assert_problem(response, 401, INVALID_SESSION)


async def test_tg53_c2_put_is_201_then_200_with_a_single_row_and_no_body(
    client: AsyncClient, connection: AsyncConnection
) -> None:
    headers = await login_headers(client)
    event_id = await upcoming(connection)

    first = await client.put(subscription(event_id), headers=headers)
    second = await client.put(subscription(event_id), headers=headers)

    assert first.status_code == 201
    assert second.status_code == 200
    assert (first.content, second.content) == (b"", b"")
    user_id = await user_id_of(client, headers)
    assert await subscriptions_count(connection, user_id, event_id) == 1


async def test_tg53_c5_put_on_an_unknown_event_is_404(
    client: AsyncClient, connection: AsyncConnection
) -> None:
    headers = await login_headers(client)
    unknown = uuid.uuid7()

    response = await client.put(subscription(unknown), headers=headers)

    assert_problem(response, 404, "EVENT_NOT_FOUND")
    user_id = await user_id_of(client, headers)
    assert await subscriptions_count(connection, user_id, unknown) == 0


async def test_tg53_c5_put_on_an_ended_event_not_subscribed_is_409(
    client: AsyncClient, connection: AsyncConnection
) -> None:
    headers = await login_headers(client)
    event_id = await ended(connection)

    response = await client.put(subscription(event_id), headers=headers)

    assert_problem(response, 409, "EVENT_ALREADY_ENDED")
    user_id = await user_id_of(client, headers)
    assert await subscriptions_count(connection, user_id, event_id) == 0


async def test_tg53_c2_put_on_an_ended_event_already_subscribed_is_200(
    client: AsyncClient, connection: AsyncConnection
) -> None:
    # Idempotencia abans del 409: la subscripcio feta quan no havia acabat es mante.
    headers = await login_headers(client)
    user_id = await user_id_of(client, headers)
    event_id = await ended(connection)
    await connection.execute(
        text(
            "INSERT INTO event_subscriptions (id, user_id, event_id, created_at)"
            " VALUES (:id, :user_id, :event_id, :created_at)"
        ),
        {
            "id": uuid.uuid7(),
            "user_id": user_id,
            "event_id": event_id,
            "created_at": datetime.now(UTC) - timedelta(days=3),
        },
    )

    response = await client.put(subscription(event_id), headers=headers)

    assert response.status_code == 200
    assert response.content == b""
    assert await subscriptions_count(connection, user_id, event_id) == 1


async def test_tg53_c3_delete_is_204_twice_and_removes_the_row(
    client: AsyncClient, connection: AsyncConnection
) -> None:
    headers = await login_headers(client)
    event_id = await upcoming(connection)
    await client.put(subscription(event_id), headers=headers)

    first = await client.delete(subscription(event_id), headers=headers)
    second = await client.delete(subscription(event_id), headers=headers)

    assert (first.status_code, second.status_code) == (204, 204)
    assert (first.content, second.content) == (b"", b"")
    user_id = await user_id_of(client, headers)
    assert await subscriptions_count(connection, user_id, event_id) == 0


async def test_tg53_c4_my_subscriptions_are_by_start_and_only_mine(
    client: AsyncClient, connection: AsyncConnection
) -> None:
    # Dos usuaris: cap IDOR, cadascu veu nomes les seves subscripcions.
    ana = await login_headers(client)
    bob = await login_headers(client)
    later = await upcoming(connection, days=5)
    sooner = await upcoming(connection, days=1)
    bobs = await upcoming(connection, days=3)
    for event_id in (later, sooner):
        assert (
            await client.put(subscription(event_id), headers=ana)
        ).status_code == 201
    assert (await client.put(subscription(bobs), headers=bob)).status_code == 201

    ana_list = await client.get(MINE, headers=ana)
    bob_list = await client.get(MINE, headers=bob)

    assert ana_list.status_code == 200
    assert [e["id"] for e in ana_list.json()] == [str(sooner), str(later)]
    assert [e["id"] for e in bob_list.json()] == [str(bobs)]


async def test_tg53_c3_a_user_cannot_unsubscribe_another(
    client: AsyncClient, connection: AsyncConnection
) -> None:
    ana = await login_headers(client)
    bob = await login_headers(client)
    event_id = await upcoming(connection)
    await client.put(subscription(event_id), headers=ana)

    response = await client.delete(subscription(event_id), headers=bob)

    assert response.status_code == 204
    ana_id = await user_id_of(client, ana)
    assert await subscriptions_count(connection, ana_id, event_id) == 1
