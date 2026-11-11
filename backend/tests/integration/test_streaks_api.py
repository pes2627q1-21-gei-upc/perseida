"""Streaks API with PostgreSQL and Redis for real. TG-540 (US TG-56).

Only Google is simulated (respx + a throwaway RSA key); the app is wired as the
lifespan does it, with the real session store, user repository and the real
``daily_streaks`` table.
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
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine

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

pytestmark = pytest.mark.skipif(
    not (os.getenv("POSTGRES_HOST") and os.getenv("REDIS_HOST")),
    reason="PostgreSQL and Redis integration test requires their hosts",
)

PROBLEM_JSON = "application/problem+json"
ACTIVITY = "/api/streaks/me/activity"
STREAK = "/api/streaks/me"


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


@pytest.fixture
async def engine() -> AsyncIterator[AsyncEngine]:
    engine = create_async_engine(DatabaseSettings().database_url)
    try:
        yield engine
    finally:
        async with engine.begin() as connection:
            await connection.execute(text("DELETE FROM daily_streaks"))
            await connection.execute(text("DELETE FROM user_identities"))
            await connection.execute(text("DELETE FROM users"))
        await engine.dispose()


@pytest.fixture
async def redis() -> AsyncIterator[Redis]:
    client = Redis.from_url(RedisSettings().redis_url, decode_responses=True)
    try:
        yield client
    finally:
        await client.aclose()


@pytest.fixture
async def client(
    google_certs: respx.Route, engine: AsyncEngine, redis: Redis
) -> AsyncIterator[AsyncClient]:
    factory = async_sessionmaker(engine, expire_on_commit=False)
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


async def test_streak_flow_register_activity_and_query(client: AsyncClient) -> None:
    # TG-540 / US TG-56: flux login -> GET 0 -> POST 1 -> GET 1 -> POST (mateix dia) 1
    headers = await login_headers(client)

    first = await client.get(STREAK, headers=headers)
    registered = await client.post(ACTIVITY, headers=headers)
    after = await client.get(STREAK, headers=headers)
    again = await client.post(ACTIVITY, headers=headers)

    assert first.status_code == 200
    assert first.json() == {"current_count": 0}
    assert registered.status_code == 200
    assert registered.json() == {"current_count": 1}
    assert after.json() == {"current_count": 1}
    assert again.status_code == 200
    assert again.json() == {"current_count": 1}


async def test_streak_row_is_persisted_once_per_user(
    client: AsyncClient, engine: AsyncEngine
) -> None:
    # TG-540 / US TG-56: idempotencia a la BD
    headers = await login_headers(client)

    await client.post(ACTIVITY, headers=headers)
    await client.post(ACTIVITY, headers=headers)

    async with engine.connect() as connection:
        rows = await connection.execute(text("SELECT count(*) FROM daily_streaks"))
        assert rows.scalar_one() == 1


@pytest.mark.parametrize(("method", "path"), [("POST", ACTIVITY), ("GET", STREAK)])
async def test_streak_endpoints_without_a_token_are_401(
    client: AsyncClient, method: str, path: str
) -> None:
    # TG-540 / US TG-56: endpoints privats sense sessio
    response = await client.request(method, path)

    assert_problem(response, 401, INVALID_SESSION)


async def test_a_user_does_not_see_the_streak_of_another(client: AsyncClient) -> None:
    # TG-540 / US TG-56: la ratxa es de l'usuari de la sessio
    ana = await login_headers(client)
    bob = await login_headers(client)

    await client.post(ACTIVITY, headers=ana)
    ana_streak = await client.get(STREAK, headers=ana)
    bob_streak = await client.get(STREAK, headers=bob)

    assert ana_streak.json() == {"current_count": 1}
    assert bob_streak.json() == {"current_count": 0}


# --- TG-541 (US TG-56): casos limit d'acceptacio de punta a punta ---------------
# S'afegeixen DESPRES del codi (TG-539/TG-540), per tant no han passat per vermell:
# son tests d'acceptacio dels criteris 2, 3, 4 i 5 a nivell d'API. El temps no es
# congela: es sembra la fila de ``daily_streaks`` amb una data relativa a avui UTC.


async def seed_streak(
    engine: AsyncEngine, *, count: int, days_ago: int
) -> tuple[uuid.UUID, Any]:
    """Insert the streak of the only user in the DB; return (user_id, date)."""
    last_date = datetime.now(UTC).date() - timedelta(days=days_ago)
    async with engine.begin() as connection:
        user_id = (await connection.execute(text("SELECT id FROM users"))).scalar_one()
        await connection.execute(
            text(
                "INSERT INTO daily_streaks (user_id, current_count, last_activity_date)"
                " VALUES (:user_id, :count, :last_date)"
            ),
            {"user_id": user_id, "count": count, "last_date": last_date},
        )
    return user_id, last_date


async def stored_streak(engine: AsyncEngine, user_id: uuid.UUID) -> tuple[int, Any]:
    async with engine.connect() as connection:
        row = (
            await connection.execute(
                text(
                    "SELECT current_count, last_activity_date FROM daily_streaks"
                    " WHERE user_id = :user_id"
                ),
                {"user_id": user_id},
            )
        ).one()
    return row[0], row[1]


async def test_activity_the_day_after_increments_the_streak(
    client: AsyncClient, engine: AsyncEngine
) -> None:
    # TG-541 / US TG-56 criteri 2: ahir amb ratxa 4 -> avui 5
    headers = await login_headers(client)
    await seed_streak(engine, count=4, days_ago=1)

    registered = await client.post(ACTIVITY, headers=headers)
    after = await client.get(STREAK, headers=headers)

    assert registered.status_code == 200
    assert registered.json() == {"current_count": 5}
    assert after.json() == {"current_count": 5}


async def test_query_of_a_broken_streak_is_0_and_does_not_write(
    client: AsyncClient, engine: AsyncEngine
) -> None:
    # TG-541 / US TG-56 criteri 4: fa 3 dies -> GET 0 sense modificar la fila
    headers = await login_headers(client)
    user_id, last_date = await seed_streak(engine, count=4, days_ago=3)

    response = await client.get(STREAK, headers=headers)

    assert response.status_code == 200
    assert response.json() == {"current_count": 0}
    assert await stored_streak(engine, user_id) == (4, last_date)


async def test_activity_after_a_gap_restarts_the_streak(
    client: AsyncClient, engine: AsyncEngine
) -> None:
    # TG-541 / US TG-56 criteri 4: fa 3 dies -> POST reinicia a 1
    headers = await login_headers(client)
    await seed_streak(engine, count=4, days_ago=3)

    registered = await client.post(ACTIVITY, headers=headers)
    after = await client.get(STREAK, headers=headers)

    assert registered.json() == {"current_count": 1}
    assert after.json() == {"current_count": 1}


async def test_activity_the_same_day_does_not_raise_the_streak(
    client: AsyncClient, engine: AsyncEngine
) -> None:
    # TG-541 / US TG-56 criteri 3: ja registrada avui -> no puja
    headers = await login_headers(client)
    await seed_streak(engine, count=4, days_ago=0)

    registered = await client.post(ACTIVITY, headers=headers)
    after = await client.get(STREAK, headers=headers)

    assert registered.json() == {"current_count": 4}
    assert after.json() == {"current_count": 4}
