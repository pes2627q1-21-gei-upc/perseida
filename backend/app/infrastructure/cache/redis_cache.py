from redis.asyncio import Redis

KEY_PREFIX = "cache:"


class RedisCache:
    """``Cache`` backed by Redis. Stored keys are ``cache:<domain>:<id>``."""

    def __init__(self, redis: Redis, default_ttl_seconds: int) -> None:
        self._redis = redis
        self._default_ttl_seconds = default_ttl_seconds

    async def get(self, key: str) -> str | None:
        value = await self._redis.get(f"{KEY_PREFIX}{key}")
        return None if value is None else str(value)

    async def set(self, key: str, value: str, ttl_seconds: int | None = None) -> None:
        ttl = ttl_seconds if ttl_seconds is not None else self._default_ttl_seconds
        await self._redis.set(f"{KEY_PREFIX}{key}", value, ex=ttl)
