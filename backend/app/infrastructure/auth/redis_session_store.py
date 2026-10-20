import logging
from typing import NoReturn

from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.application.auth.errors import SESSION_UNAVAILABLE
from app.application.shared.errors import ExternalServiceError
from app.domain.auth.models import TokenType

logger = logging.getLogger(__name__)

KEY_PREFIX = "session:"


def _unavailable(jti: str, exc: RedisError) -> NoReturn:
    # Log the jti only, never a token; the Redis message may carry host and port.
    logger.warning("Redis unavailable for session %s", jti, exc_info=exc)
    raise ExternalServiceError(SESSION_UNAVAILABLE) from exc


class RedisSessionStore:
    """``SessionStore`` backed by Redis. Stored keys are ``session:<kind>:<jti>``.

    Unlike the cache, a Redis failure is raised, never treated as a miss: a
    session that cannot be checked must not be reported as revoked or valid.
    """

    def __init__(self, redis: Redis) -> None:
        self._redis = redis

    @staticmethod
    def _key(kind: TokenType, jti: str) -> str:
        return f"{KEY_PREFIX}{kind.value}:{jti}"

    async def save(self, kind: TokenType, jti: str, ttl_seconds: int) -> None:
        try:
            await self._redis.set(self._key(kind, jti), "1", ex=ttl_seconds)
        except RedisError as exc:
            _unavailable(jti, exc)

    async def exists(self, kind: TokenType, jti: str) -> bool:
        try:
            return bool(await self._redis.exists(self._key(kind, jti)))
        except RedisError as exc:
            _unavailable(jti, exc)

    async def delete(self, kind: TokenType, jti: str) -> None:
        try:
            await self._redis.delete(self._key(kind, jti))
        except RedisError as exc:
            _unavailable(jti, exc)
