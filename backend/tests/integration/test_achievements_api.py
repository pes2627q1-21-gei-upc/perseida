"""GET /api/users/me/achievements with PostgreSQL and Redis for real.

TG-574 (US TG-58 criteri 7). Same wiring as ``test_streaks_api.py``; the streak
and the unlocks are seeded in the real tables.
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
PATH = "/api/users/me/achievements"
# Redis database only for these tests (the app uses 0), emptied before and after.
TEST_REDIS_DB = 15


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
        # The streak service is built per request from the app state session factory.
        app.state.session_factory = factory
        app.state.user_service = users
        app.state.auth_service = AuthService(
            GoogleJwksVerifier(google, [CLIENT_ID]),
            JwtTokenCodec("i" * 40),
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


def assert_problem(response: Response, status: int, code: str) -> None:
    assert response.status_code == status
    assert response.headers["content-type"].startswith(PROBLEM_JSON)
    assert response.json()["code"] == code


async def user_id_of(client: AsyncClient, headers: dict[str, str]) -> uuid.UUID:
    response = await client.get("/api/users/me", headers=headers)
    return uuid.UUID(response.json()["id"])


async def seed_streak(
    connection: AsyncConnection,
    user_id: uuid.UUID,
    *,
    count: int,
    days_ago: int,
) -> Any:
    """Insert the streak of the user; return its last activity date."""
    last_date = datetime.now(UTC).date() - timedelta(days=days_ago)
    await connection.execute(
        text(
            "INSERT INTO daily_streaks (user_id, current_count, last_activity_date)"
            " VALUES (:user_id, :count, :last_date)"
        ),
        {"user_id": user_id, "count": count, "last_date": last_date},
    )
    return last_date


async def _unlock(connection: AsyncConnection, user_id: uuid.UUID, code: str) -> None:
    await connection.execute(
        text(
            "INSERT INTO user_achievements (user_id, achievement_id)"
            " SELECT :user_id, id FROM achievements WHERE code = :code"
        ),
        {"user_id": user_id, "code": code},
    )


def _by_code(items: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {item["code"]: item for item in items}


async def test_without_a_token_is_401_invalid_session(client: AsyncClient) -> None:
    # TG-574 / US TG-58 criteri 7: endpoint privat
    assert_problem(await client.get(PATH), 401, INVALID_SESSION)


async def test_lists_the_whole_catalog_ordered_by_category_and_position(
    client: AsyncClient,
) -> None:
    # TG-574 / US TG-58 criteri 7
    headers = await login_headers(client)

    response = await client.get(PATH, headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 34
    assert all(item["unlocked"] is False for item in body)
    assert all(item["unlocked_at"] is None for item in body)
    categories = [item["category"] for item in body]
    assert len(
        [c for i, c in enumerate(categories) if i == 0 or c != categories[i - 1]]
    ) == len(set(categories))
    for category in set(categories):
        positions = [i["position"] for i in body if i["category"] == category]
        assert positions == sorted(positions)


async def test_streak_of_5_with_the_first_achievement_unlocked(
    client: AsyncClient, connection: AsyncConnection
) -> None:
    # TG-574 / US TG-58 criteri 7: orbita_setmanal (7) -> 5/7; primera_llum (1) -> 1/1
    headers = await login_headers(client)
    user_id = await user_id_of(client, headers)
    await seed_streak(connection, user_id, count=5, days_ago=0)
    await _unlock(connection, user_id, "primera_llum")

    items = _by_code((await client.get(PATH, headers=headers)).json())

    first = items["primera_llum"]
    assert (first["current"], first["goal"], first["unlocked"]) == (1, 1, True)
    unlocked_at = datetime.fromisoformat(first["unlocked_at"])
    assert unlocked_at.utcoffset() == timedelta(0)
    assert abs(datetime.now(UTC) - unlocked_at) < timedelta(minutes=1)
    weekly = items["orbita_setmanal"]
    assert (weekly["current"], weekly["goal"], weekly["unlocked"]) == (5, 7, False)
    assert weekly["unlocked_at"] is None


async def test_progress_never_exceeds_the_goal(
    client: AsyncClient, connection: AsyncConnection
) -> None:
    # TG-574 / US TG-58 criteri 7: ratxa 20 -> fita de 7 surt 7 de 7
    headers = await login_headers(client)
    await seed_streak(
        connection, await user_id_of(client, headers), count=20, days_ago=0
    )

    weekly = _by_code((await client.get(PATH, headers=headers)).json())[
        "orbita_setmanal"
    ]

    assert (weekly["current"], weekly["goal"]) == (7, 7)


async def test_an_unlocked_achievement_stays_full_after_the_streak_lapsed(
    client: AsyncClient, connection: AsyncConnection
) -> None:
    # TG-574 / US TG-58 criteri 7: desbloquejada, ratxa caducada (0)
    headers = await login_headers(client)
    user_id = await user_id_of(client, headers)
    await seed_streak(connection, user_id, count=7, days_ago=5)
    await _unlock(connection, user_id, "orbita_setmanal")

    weekly = _by_code((await client.get(PATH, headers=headers)).json())[
        "orbita_setmanal"
    ]

    assert (weekly["current"], weekly["goal"], weekly["unlocked"]) == (7, 7, True)
    assert weekly["unlocked_at"] is not None


async def test_a_user_does_not_see_the_unlocks_of_another(
    client: AsyncClient, connection: AsyncConnection
) -> None:
    # TG-574 / US TG-58 criteri 7: nomes les fites de l'usuari de la sessio
    ana = await login_headers(client)
    bob = await login_headers(client)
    await _unlock(connection, await user_id_of(client, ana), "primera_llum")

    bob_items = _by_code((await client.get(PATH, headers=bob)).json())

    assert bob_items["primera_llum"]["unlocked"] is False
    assert bob_items["primera_llum"]["unlocked_at"] is None


def test_the_openapi_documents_the_endpoint() -> None:
    # TG-574 / US TG-58 criteri 7: OpenAPI global
    from app.main import create_app

    operation = create_app().openapi()["paths"][PATH]["get"]

    assert operation["operationId"] == "list_my_achievements"
    assert {"200", "401", "403", "503"} <= set(operation["responses"])
