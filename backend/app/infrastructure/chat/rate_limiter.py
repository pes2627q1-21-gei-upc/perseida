import uuid

from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.application.realtime.errors import PUBSUB_UNAVAILABLE
from app.application.shared.errors import ExternalServiceError

_HIT = """
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return count
"""


class RedisSendRateLimiter:
    """Atomic fixed-window counter per user, shared across application workers.

    ``key_prefix`` separates the counters of each use (chat messages, post writes).
    """

    def __init__(
        self,
        redis: Redis,
        limit: int = 10,
        window_seconds: int = 10,
        *,
        key_prefix: str = "chat",
    ) -> None:
        if limit < 1 or window_seconds < 1:
            raise ValueError("limit and window must be positive")
        self._redis = redis
        self._limit = limit
        self._window_seconds = window_seconds
        self._key_prefix = key_prefix

    async def hit(self, user_id: uuid.UUID) -> bool:
        try:
            count = await self._redis.eval(
                _HIT, 1, f"ratelimit:{self._key_prefix}:{user_id}", self._window_seconds
            )
            return int(count) <= self._limit
        except RedisError as exc:
            raise ExternalServiceError(PUBSUB_UNAVAILABLE) from exc
