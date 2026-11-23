import asyncio
import os
from collections.abc import AsyncIterator
from uuid import uuid4

import pytest
from redis.asyncio import Redis

from app.application.shared.errors import ExternalServiceError
from app.infrastructure.cache.config import RedisSettings
from app.infrastructure.chat.rate_limiter import RedisSendRateLimiter

pytestmark = pytest.mark.skipif(not os.getenv("REDIS_HOST"), reason="Redis required")


@pytest.fixture
async def redis() -> AsyncIterator[Redis]:
    client = Redis.from_url(RedisSettings().redis_url)
    yield client
    await client.aclose()


async def test_tg444_limit_is_atomic_and_isolated(redis: Redis) -> None:
    limiter = RedisSendRateLimiter(redis)
    user, other = uuid4(), uuid4()
    try:
        results = await asyncio.gather(*(limiter.hit(user) for _ in range(11)))
        assert sum(results) == 10
        assert await limiter.hit(other)
        assert 0 < await redis.ttl(f"ratelimit:chat:{user}") <= 10
        await redis.expire(f"ratelimit:chat:{user}", 0)
        assert await limiter.hit(user)
    finally:
        await redis.delete(f"ratelimit:chat:{user}", f"ratelimit:chat:{other}")


async def test_tg444_redis_unavailable_is_translated() -> None:
    client = Redis(host="127.0.0.1", port=1, socket_connect_timeout=0.1)
    try:
        with pytest.raises(ExternalServiceError):
            await RedisSendRateLimiter(client).hit(uuid4())
    finally:
        await client.aclose()


async def test_tg645_posts_prefix_uses_its_own_key_and_counter(redis: Redis) -> None:
    # TG-645: el límit de posts no comparteix comptador amb el del xat
    posts = RedisSendRateLimiter(redis, limit=1, window_seconds=60, key_prefix="posts")
    chat = RedisSendRateLimiter(redis, limit=1, window_seconds=60)
    user = uuid4()
    try:
        assert await posts.hit(user)
        assert not await posts.hit(user)
        assert await chat.hit(user)
        posts_count = await redis.get(f"ratelimit:posts:{user}")
        chat_count = await redis.get(f"ratelimit:chat:{user}")
        assert posts_count is not None and int(posts_count) == 2
        assert chat_count is not None and int(chat_count) == 1
        assert 0 < await redis.ttl(f"ratelimit:posts:{user}") <= 60
    finally:
        await redis.delete(f"ratelimit:posts:{user}", f"ratelimit:chat:{user}")
