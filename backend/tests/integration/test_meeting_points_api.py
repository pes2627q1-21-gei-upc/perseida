"""GET /api/meeting-points over the full app (TG-352).

create_app() with its lifespan: the space search it builds (Spotwise client or
mock), get_meeting_point_service, RedisCache over Redis for real and the JSON
round trip of the cache. Spotwise and Google are simulated with respx; the
users and sessions live in a rolled-back transaction and a test Redis database,
as in the outings API tests.
"""

import json
import os
import uuid
from collections.abc import AsyncIterator, Iterator
from pathlib import Path
from typing import Any

import httpx
import pytest
import respx
from alembic.config import Config
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import (
    AsyncConnection,
    async_sessionmaker,
    create_async_engine,
)

from alembic import command
from app.application.auth.auth_service import AuthService, SessionDurations
from app.application.meeting_points.errors import MEETING_POINTS_UNAVAILABLE
from app.infrastructure.auth.google_verifier import (
    GOOGLE_CERTS_URL,
    GoogleJwksVerifier,
)
from app.infrastructure.auth.jwt_codec import JwtTokenCodec
from app.infrastructure.auth.redis_session_store import RedisSessionStore
from app.infrastructure.cache.redis_pubsub import RedisPubSub
from app.infrastructure.meeting_points.config import SpotwiseSettings
from app.infrastructure.meeting_points.examples import ExampleSpaceSearch
from app.infrastructure.meeting_points.spotwise_client import SpotwiseSpaceClient
from app.infrastructure.persistence.config import DatabaseSettings
from app.infrastructure.scheduler.dependencies import get_scheduler_settings
from app.infrastructure.users.account_gateway import UserAccountGateway
from app.infrastructure.users.dependencies import build_user_service
from app.main import create_app
from tests.factories.google import CLIENT_ID, KEY, jwk, token
from tests.integration.isolation import row_counts

pytestmark = pytest.mark.skipif(
    not (os.getenv("POSTGRES_HOST") and os.getenv("REDIS_HOST")),
    reason="Meeting points API integration requires POSTGRES_HOST and REDIS_HOST",
)

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures"
PROBLEM_JSON = "application/problem+json"
PATH = "/api/meeting-points"
SPOTWISE_URL = "http://spotwise.test:40420"
SPACES_URL = f"{SPOTWISE_URL}/api/espais/"
SPOTWISE_TOKEN = "it-spotwise-token-tg352"
WATCH_PARTY = {"profile": "watch_party", "lat": "41.40449", "lon": "2.17123"}
CACHE_KEY = "cache:meeting_points:watch_party:41.404:2.171"


def example() -> list[dict[str, Any]]:
    data: list[dict[str, Any]] = json.loads(
        (FIXTURES / "spotwise_espais_watch_party.json").read_text(encoding="utf-8")
    )
    return data


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
def _env(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setenv("SCHEDULER_ENABLED", "false")
    # The lifespan also builds the auth service and the APOD settings.
    monkeypatch.setenv("GOOGLE_CLIENT_IDS", CLIENT_ID)
    monkeypatch.setenv("JWT_SECRET", "t" * 32)
    monkeypatch.setenv("NASA_API_KEY", "it-nasa-key")
    monkeypatch.setenv("SPOTWISE_URL", SPOTWISE_URL)
    monkeypatch.setenv("SPOTWISE_API_TOKEN", SPOTWISE_TOKEN)
    # Do not read a local backend/.env: with a token there, the test without
    # token would call Spotwise.
    monkeypatch.setitem(SpotwiseSettings.model_config, "env_file", None)
    get_scheduler_settings.cache_clear()
    yield
    get_scheduler_settings.cache_clear()


@pytest.fixture
def mocked() -> Iterator[respx.MockRouter]:
    with respx.mock(assert_all_called=False) as router:
        router.get(GOOGLE_CERTS_URL).respond(json={"keys": [jwk(KEY, "k1")]})
        yield router


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


async def _client(
    connection: AsyncConnection, redis: Redis
) -> AsyncIterator[tuple[FastAPI, AsyncClient]]:
    """The app after its lifespan; users, sessions and cache on the test stores."""
    factory = async_sessionmaker(
        bind=connection,
        expire_on_commit=False,
        join_transaction_mode="create_savepoint",
    )
    app = create_app()
    async with app.router.lifespan_context(app), httpx.AsyncClient() as google:
        users = build_user_service(factory)
        app.state.session_factory = factory
        app.state.user_service = users
        app.state.redis = redis
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
            yield app, http


@pytest.fixture
async def app_client(
    _env: None,
    mocked: respx.MockRouter,
    connection: AsyncConnection,
    redis: Redis,
) -> AsyncIterator[tuple[FastAPI, AsyncClient]]:
    async for pair in _client(connection, redis):
        yield pair


async def _login(client: AsyncClient) -> dict[str, str]:
    sub = f"it-meeting-points-{uuid.uuid4().hex}"
    id_token = token(sub=sub, email=f"{sub}@example.test", name="Anna")
    response = await client.post("/api/auth/google", json={"id_token": id_token})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def test_tg352_the_lifespan_builds_one_spotwise_client(
    app_client: tuple[FastAPI, AsyncClient],
) -> None:
    app, _ = app_client

    assert isinstance(app.state.space_search, SpotwiseSpaceClient)


async def test_tg352_a_miss_calls_spotwise_and_caches_for_300_seconds(
    app_client: tuple[FastAPI, AsyncClient],
    mocked: respx.MockRouter,
    redis: Redis,
) -> None:
    _, client = app_client
    route = mocked.get(SPACES_URL).respond(json=example())
    headers = await _login(client)

    response = await client.get(PATH, params=WATCH_PARTY, headers=headers)

    assert response.status_code == 200, response.text
    assert [space["id"] for space in response.json()] == [12]
    assert route.call_count == 1
    request = route.calls.last.request
    assert request.headers["Authorization"] == f"Token {SPOTWISE_TOKEN}"
    assert request.url.params["lat"] == "41.404"
    assert await redis.exists(CACHE_KEY) == 1
    assert 290 <= await redis.ttl(CACHE_KEY) <= 300


async def test_tg352_a_hit_answers_from_redis_without_calling_spotwise(
    app_client: tuple[FastAPI, AsyncClient],
    mocked: respx.MockRouter,
) -> None:
    _, client = app_client
    route = mocked.get(SPACES_URL).respond(json=example())
    headers = await _login(client)
    first = await client.get(PATH, params=WATCH_PARTY, headers=headers)

    # A nearby point rounds to the same key.
    second = await client.get(
        PATH,
        params={**WATCH_PARTY, "lat": "41.4041", "lon": "2.1709"},
        headers=headers,
    )

    assert second.status_code == 200
    assert second.json() == first.json()
    assert route.call_count == 1


async def test_tg352_spotwise_down_is_503_problem_and_nothing_is_cached(
    app_client: tuple[FastAPI, AsyncClient],
    mocked: respx.MockRouter,
    redis: Redis,
) -> None:
    _, client = app_client
    mocked.get(SPACES_URL).respond(500, text="<html>Internal Server Error</html>")
    headers = await _login(client)

    response = await client.get(PATH, params=WATCH_PARTY, headers=headers)

    assert response.status_code == 503
    assert response.headers["content-type"].startswith(PROBLEM_JSON)
    assert response.json()["code"] == MEETING_POINTS_UNAVAILABLE
    assert SPOTWISE_TOKEN not in response.text
    assert await redis.exists(CACHE_KEY) == 0


async def test_tg352_without_token_the_mock_answers_without_calling_spotwise(
    _env: None,
    monkeypatch: pytest.MonkeyPatch,
    mocked: respx.MockRouter,
    connection: AsyncConnection,
    redis: Redis,
) -> None:
    monkeypatch.delenv("SPOTWISE_API_TOKEN")
    route = mocked.get(SPACES_URL).respond(json=[])
    async for app, client in _client(connection, redis):
        headers = await _login(client)

        response = await client.get(PATH, params=WATCH_PARTY, headers=headers)

        assert isinstance(app.state.space_search, ExampleSpaceSearch)
    assert response.status_code == 200, response.text
    assert [space["id"] for space in response.json()] == [12]
    assert route.call_count == 0
