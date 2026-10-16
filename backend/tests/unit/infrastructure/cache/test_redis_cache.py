from typing import Any, cast
from unittest.mock import AsyncMock

from fastapi import FastAPI
from starlette.requests import HTTPConnection

from app.infrastructure.cache.dependencies import get_cache
from app.infrastructure.cache.redis_cache import RedisCache


def _redis(get_value: str | None = None) -> AsyncMock:
    redis = AsyncMock()
    redis.get.return_value = get_value
    return redis


async def test_tg145_get_prefixes_the_key() -> None:
    redis = _redis("value")
    cache = RedisCache(cast(Any, redis), default_ttl_seconds=60)

    assert await cache.get("apod:2026-10-05") == "value"
    redis.get.assert_awaited_once_with("cache:apod:2026-10-05")


async def test_tg145_set_uses_the_default_ttl() -> None:
    redis = _redis()
    cache = RedisCache(cast(Any, redis), default_ttl_seconds=60)

    await cache.set("apod:2026-10-05", "value")

    redis.set.assert_awaited_once_with("cache:apod:2026-10-05", "value", ex=60)


async def test_tg145_set_ttl_can_be_overridden_per_key() -> None:
    redis = _redis()
    cache = RedisCache(cast(Any, redis), default_ttl_seconds=60)

    await cache.set("quiz:today", "value", ttl_seconds=5)

    redis.set.assert_awaited_once_with("cache:quiz:today", "value", ex=5)


def test_tg145_get_cache_builds_the_adapter_from_app_state() -> None:
    app = FastAPI()
    app.state.redis = _redis()
    app.state.cache_default_ttl_seconds = 60
    conn = HTTPConnection({"type": "http", "app": app, "headers": []})

    assert isinstance(get_cache(conn), RedisCache)
