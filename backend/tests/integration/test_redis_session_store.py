import asyncio
import os
from collections.abc import AsyncIterator
from uuid import uuid4

import pytest
from redis.asyncio import Redis

from app.domain.auth.models import TokenType
from app.infrastructure.auth.redis_session_store import RedisSessionStore
from app.infrastructure.cache.config import RedisSettings

pytestmark = pytest.mark.skipif(
    not os.getenv("REDIS_HOST"),
    reason="Redis integration tests require REDIS_HOST",
)


@pytest.fixture
async def redis() -> AsyncIterator[Redis]:
    client = Redis.from_url(RedisSettings().redis_url, decode_responses=True)
    try:
        yield client
    finally:
        await client.aclose()


@pytest.fixture
def jti() -> str:
    return f"test-{uuid4().hex}"


async def test_a_saved_token_exists_under_the_session_prefix(
    redis: Redis, jti: str
) -> None:
    store = RedisSessionStore(redis)

    await store.save(TokenType.ACCESS, jti, 900)

    assert await store.exists(TokenType.ACCESS, jti)
    assert not await store.exists(TokenType.REFRESH, jti)
    assert 0 < await redis.ttl(f"session:access:{jti}") <= 900
    await store.delete(TokenType.ACCESS, jti)


async def test_a_token_disappears_after_its_ttl(redis: Redis, jti: str) -> None:
    store = RedisSessionStore(redis)

    await store.save(TokenType.ACCESS, jti, 1)
    assert await store.exists(TokenType.ACCESS, jti)
    await asyncio.sleep(1.2)

    assert not await store.exists(TokenType.ACCESS, jti)


async def test_delete_revokes_the_token_and_is_idempotent(
    redis: Redis, jti: str
) -> None:
    store = RedisSessionStore(redis)
    await store.save(TokenType.REFRESH, jti, 900)

    await store.delete(TokenType.REFRESH, jti)
    await store.delete(TokenType.REFRESH, jti)

    assert not await store.exists(TokenType.REFRESH, jti)
