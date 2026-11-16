import asyncio
import os
from collections.abc import AsyncIterator
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from pydantic import BaseModel, TypeAdapter
from redis.asyncio import Redis

from app.application.shared.cache import get_or_load
from app.infrastructure.cache.config import RedisSettings
from app.infrastructure.cache.redis_cache import RedisCache
from app.infrastructure.cache.redis_pubsub import RedisPubSub

pytestmark = pytest.mark.skipif(
    not os.getenv("REDIS_HOST"),
    reason="Redis integration tests require REDIS_HOST",
)


class Item(BaseModel):
    name: str


@pytest.fixture
async def redis() -> AsyncIterator[Redis]:
    settings = RedisSettings()
    client = Redis.from_url(settings.redis_url, decode_responses=True)
    try:
        yield client
    finally:
        await client.aclose()


@pytest.fixture
def key() -> str:
    return f"test:{uuid4().hex}"


@pytest.fixture
def cache(redis: Redis) -> RedisCache:
    return RedisCache(redis, default_ttl_seconds=3600)


async def test_tg148_value_is_stored_under_the_cache_prefix_with_default_ttl(
    cache: RedisCache, redis: Redis, key: str
) -> None:
    await cache.set(key, "value")

    assert await redis.get(f"cache:{key}") == "value"
    assert 0 < await redis.ttl(f"cache:{key}") <= 3600
    await redis.delete(f"cache:{key}")


async def test_tg148_ttl_can_be_overridden_per_key(
    cache: RedisCache, redis: Redis, key: str
) -> None:
    await cache.set(key, "value", ttl_seconds=100)

    assert 0 < await redis.ttl(f"cache:{key}") <= 100
    await redis.delete(f"cache:{key}")


async def test_tg148_value_expires_and_the_loader_runs_again(
    cache: RedisCache, key: str
) -> None:
    load = AsyncMock(return_value=Item(name="apod"))
    adapter = TypeAdapter(Item)

    await get_or_load(cache, key, load, adapter, ttl_seconds=1)
    await asyncio.sleep(1.2)
    await get_or_load(cache, key, load, adapter, ttl_seconds=1)

    assert load.await_count == 2


async def test_tg148_hit_does_not_call_the_loader_and_missing_key_reloads(
    cache: RedisCache, redis: Redis, key: str
) -> None:
    load = AsyncMock(return_value=Item(name="apod"))
    adapter = TypeAdapter(Item)

    await get_or_load(cache, key, load, adapter)
    await get_or_load(cache, key, load, adapter)
    assert load.await_count == 1

    await redis.delete(f"cache:{key}")
    assert await get_or_load(cache, key, load, adapter) == Item(name="apod")
    assert load.await_count == 2
    await redis.delete(f"cache:{key}")


async def test_tg148_message_reaches_all_subscribers_of_the_channel_only(
    redis: Redis, key: str
) -> None:
    pubsub = RedisPubSub(redis)
    channel, other = f"{key}:a", f"{key}:b"

    async with (
        pubsub.subscribe(channel) as first,
        pubsub.subscribe(channel) as second,
        pubsub.subscribe(other) as unrelated,
    ):
        await pubsub.publish(channel, "hola")

        assert await asyncio.wait_for(anext(first), timeout=2) == "hola"
        assert await asyncio.wait_for(anext(second), timeout=2) == "hola"
        with pytest.raises(TimeoutError):
            await asyncio.wait_for(anext(unrelated), timeout=0.3)
