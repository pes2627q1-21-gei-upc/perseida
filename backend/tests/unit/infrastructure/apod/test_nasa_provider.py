"""NasaApodProvider with fake cache and repository; the NASA is simulated (respx)."""

import json
import logging
from collections.abc import AsyncIterator
from datetime import date
from pathlib import Path
from typing import Any, cast
from unittest.mock import AsyncMock

import httpx
import pytest
import respx
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from pydantic import SecretStr
from redis.exceptions import ConnectionError as RedisConnectionError
from starlette.requests import HTTPConnection

from app.application.apod.errors import APOD_UNAVAILABLE
from app.application.shared.errors import ExternalServiceError
from app.domain.apod.models import Apod
from app.domain.shared.ports import Cache
from app.infrastructure.api.error_handlers import register_error_handlers
from app.infrastructure.apod.dependencies import get_apod_provider
from app.infrastructure.apod.nasa_client import APOD_URL, NasaApodClient
from app.infrastructure.apod.nasa_provider import APOD_TTL_SECONDS, NasaApodProvider
from app.infrastructure.apod.router import router
from app.infrastructure.cache.redis_cache import RedisCache
from tests.factories.apod import make_apod
from tests.fakes.apod import FakeApodRepository
from tests.fakes.cache import FakeCache

FIXTURES = Path(__file__).resolve().parents[3] / "fixtures"
TODAY = date(2026, 10, 21)
YESTERDAY = date(2026, 10, 20)
DAY = date(2026, 10, 14)


def nasa_answer(day: date) -> dict[str, object]:
    body = json.loads((FIXTURES / "nasa_apod_image.json").read_text(encoding="utf-8"))
    return {**body, "date": day.isoformat()}


@pytest.fixture
async def http() -> AsyncIterator[httpx.AsyncClient]:
    async with httpx.AsyncClient() as client:
        yield client


@pytest.fixture
def cache() -> FakeCache:
    return FakeCache()


@pytest.fixture
def repository() -> FakeApodRepository:
    return FakeApodRepository()


def make_provider(
    http: httpx.AsyncClient, cache: Cache, repository: FakeApodRepository
) -> NasaApodProvider:
    client = NasaApodClient(http, SecretStr("test-key"), timeout_seconds=1)
    return NasaApodProvider(client, cache, repository, today=lambda: TODAY)


@respx.mock
async def test_tg46_c3_second_request_is_served_from_the_cache(
    http: httpx.AsyncClient, cache: FakeCache, repository: FakeApodRepository
) -> None:
    route = respx.get(APOD_URL).respond(json=nasa_answer(DAY))
    provider = make_provider(http, cache, repository)

    first = await provider.get_by_date(DAY)
    repository.by_date.clear()  # only the cache can answer now
    second = await provider.get_by_date(DAY)

    assert first == second
    assert route.call_count == 1


@respx.mock
async def test_tg46_c3_caches_under_the_apod_key_for_24_hours(
    http: httpx.AsyncClient, cache: FakeCache, repository: FakeApodRepository
) -> None:
    respx.get(APOD_URL).respond(json=nasa_answer(DAY))

    await make_provider(http, cache, repository).get_by_date(DAY)

    assert Apod.model_validate_json(cache.values["apod:2026-10-14"]).apod_date == DAY
    assert cache.ttls["apod:2026-10-14"] == APOD_TTL_SECONDS == 86400


@respx.mock
async def test_tg46_c4_stores_what_the_nasa_returns(
    http: httpx.AsyncClient, cache: FakeCache, repository: FakeApodRepository
) -> None:
    respx.get(APOD_URL).respond(json=nasa_answer(DAY))

    apod = await make_provider(http, cache, repository).get_by_date(DAY)

    assert repository.by_date[DAY] == apod


@respx.mock
async def test_tg46_c8_empty_cache_is_filled_from_postgres_without_the_nasa(
    http: httpx.AsyncClient, cache: FakeCache
) -> None:
    route = respx.get(APOD_URL).respond(500)
    stored = make_apod(DAY)
    repository = FakeApodRepository([stored])

    apod = await make_provider(http, cache, repository).get_by_date(DAY)

    assert apod == stored
    assert route.call_count == 0
    assert "apod:2026-10-14" in cache.values


@respx.mock
async def test_tg46_c8_redis_down_falls_back_and_logs_a_warning(
    http: httpx.AsyncClient,
    repository: FakeApodRepository,
    caplog: pytest.LogCaptureFixture,
) -> None:
    respx.get(APOD_URL).respond(json=nasa_answer(DAY))
    redis = AsyncMock()
    redis.get.side_effect = RedisConnectionError("down")
    redis.set.side_effect = RedisConnectionError("down")
    caplog.set_level(logging.WARNING)

    cache = RedisCache(cast(Any, redis), default_ttl_seconds=60)
    apod = await make_provider(http, cache, repository).get_by_date(DAY)

    assert apod.apod_date == DAY
    assert "Redis unavailable" in caplog.text


@respx.mock
async def test_tg46_c6_nasa_down_serves_the_stored_apod(
    http: httpx.AsyncClient, cache: FakeCache
) -> None:
    respx.get(APOD_URL).respond(503)
    stored = make_apod(DAY)
    provider = make_provider(http, cache, FakeApodRepository([stored]))

    assert await provider.get_by_date(DAY) == stored


@respx.mock
async def test_tg46_c7_nasa_down_and_nothing_stored_raises_apod_unavailable(
    http: httpx.AsyncClient, cache: FakeCache, repository: FakeApodRepository
) -> None:
    respx.get(APOD_URL).respond(503)

    with pytest.raises(ExternalServiceError) as raised:
        await make_provider(http, cache, repository).get_by_date(DAY)

    assert raised.value.code == APOD_UNAVAILABLE
    assert raised.value.message == "NASA APOD API unavailable"
    assert cache.values == {}


@respx.mock
async def test_tg46_today_is_served_from_the_cache_without_the_nasa(
    http: httpx.AsyncClient, cache: FakeCache
) -> None:
    route = respx.get(APOD_URL).respond(500)
    stored = make_apod(TODAY)
    provider = make_provider(http, cache, FakeApodRepository([stored]))

    assert await provider.get_today() == stored
    assert await provider.get_today() == stored
    assert route.call_count == 0


@respx.mock
async def test_tg46_today_before_nasa_publishes_is_its_latest_apod(
    http: httpx.AsyncClient, cache: FakeCache, repository: FakeApodRepository
) -> None:
    route = respx.get(APOD_URL).respond(json=nasa_answer(YESTERDAY))

    apod = await make_provider(http, cache, repository).get_today()

    assert apod.apod_date == YESTERDAY
    assert "date" not in route.calls.last.request.url.params
    assert repository.by_date[YESTERDAY] == apod
    assert "apod:2026-10-20" in cache.values
    assert "apod:2026-10-21" not in cache.values


@respx.mock
async def test_tg46_c6_today_with_nasa_down_serves_the_latest_stored(
    http: httpx.AsyncClient, cache: FakeCache
) -> None:
    respx.get(APOD_URL).respond(503)
    repository = FakeApodRepository([make_apod(DAY), make_apod(YESTERDAY)])

    apod = await make_provider(http, cache, repository).get_today()

    assert apod.apod_date == YESTERDAY


@respx.mock
async def test_tg46_c7_today_with_nasa_down_and_nothing_stored_raises(
    http: httpx.AsyncClient, cache: FakeCache, repository: FakeApodRepository
) -> None:
    respx.get(APOD_URL).respond(503)

    with pytest.raises(ExternalServiceError) as raised:
        await make_provider(http, cache, repository).get_today()

    assert raised.value.code == APOD_UNAVAILABLE


@respx.mock
async def test_tg46_c7_endpoint_answers_503_problem_json(
    http: httpx.AsyncClient, cache: FakeCache, repository: FakeApodRepository
) -> None:
    respx.get(APOD_URL).respond(503)
    app = FastAPI()
    register_error_handlers(app)
    app.include_router(router, prefix="/api")
    app.dependency_overrides[get_apod_provider] = lambda: make_provider(
        http, cache, repository
    )

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.get("/api/apod", params={"date": "2026-10-14"})

    assert response.status_code == 503
    assert response.headers["content-type"] == "application/problem+json"
    body = response.json()
    assert body["code"] == APOD_UNAVAILABLE
    assert "test-key" not in response.text


async def test_tg46_c1_provider_is_built_from_the_lifespan_resources(
    http: httpx.AsyncClient, cache: FakeCache
) -> None:
    app = FastAPI()
    app.state.nasa_http = http
    app.state.nasa_api_key = SecretStr("test-key")
    app.state.nasa_timeout_seconds = 1.0
    app.state.session_factory = object()
    conn = HTTPConnection({"type": "http", "app": app, "headers": []})

    provider = get_apod_provider(conn, cache)

    assert isinstance(provider, NasaApodProvider)
