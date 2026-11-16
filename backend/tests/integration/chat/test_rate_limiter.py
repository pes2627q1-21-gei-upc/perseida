import asyncio
import os
from collections.abc import AsyncIterator
from uuid import uuid4

import pytest
from redis.asyncio import Redis

from app.application.shared.errors import ExternalServiceError
from app.infrastructure.chat.rate_limiter import RedisSendRateLimiter

pytestmark = pytest.mark.skipif(not os.getenv("REDIS_HOST"), reason="Redis required")


@pytest.fixture
async def redis() -> AsyncIterator[Redis]:
    client = Redis(
        host=os.environ["REDIS_HOST"], port=int(os.getenv("REDIS_PORT", "6379"))
    )
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
