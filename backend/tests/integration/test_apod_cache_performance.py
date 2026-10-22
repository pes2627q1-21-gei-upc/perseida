import os
import statistics
import time
from collections.abc import AsyncIterator, Iterator

import pytest
import respx
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.infrastructure.apod.nasa_client import APOD_URL
from app.infrastructure.cache.redis_cache import RedisCache
from app.infrastructure.scheduler.dependencies import get_scheduler_settings
from app.main import create_app
from tests.factories.apod import make_apod

pytestmark = pytest.mark.skipif(
    not (os.getenv("REDIS_HOST") and os.getenv("POSTGRES_HOST")),
    reason="APOD cache timing requires REDIS_HOST and POSTGRES_HOST",
)

REQUESTS = 20
DAY = "2026-10-14"


@pytest.fixture
def _env(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setenv("SCHEDULER_ENABLED", "false")
    monkeypatch.setenv("NASA_API_KEY", "test-nasa-api-key")
    get_scheduler_settings.cache_clear()
    yield
    get_scheduler_settings.cache_clear()


@pytest.fixture
async def app(_env: None) -> AsyncIterator[FastAPI]:
    app = create_app()
    async with app.router.lifespan_context(app):
        yield app


async def test_tg46_c9_apod_served_from_redis_in_200_ms_or_less(app: FastAPI) -> None:
    cache = RedisCache(app.state.redis, default_ttl_seconds=60)
    await cache.set(f"apod:{DAY}", make_apod().model_dump_json())

    try:
        with respx.mock(assert_all_called=False) as nasa:
            route = nasa.get(APOD_URL).respond(500)
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                timings = []
                for _ in range(REQUESTS):
                    start = time.perf_counter()
                    response = await client.get("/api/apod", params={"date": DAY})
                    timings.append(time.perf_counter() - start)
                    assert response.status_code == 200
    finally:
        await app.state.redis.delete(f"cache:apod:{DAY}")

    assert route.call_count == 0
    assert statistics.median(timings) <= 0.2
