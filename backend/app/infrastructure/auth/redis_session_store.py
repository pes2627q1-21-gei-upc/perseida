import logging
from typing import NoReturn, cast

from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.application.auth.errors import SESSION_UNAVAILABLE
from app.application.shared.errors import ExternalServiceError
from app.domain.auth.models import SessionClaims, TokenType

logger = logging.getLogger(__name__)

KEY_PREFIX = "session:"
INDEX_PREFIX = "user_sessions:"


def _unavailable(jti: str, exc: RedisError) -> NoReturn:
    # Log the jti only, never a token; the Redis message may carry host and port.
    logger.warning("Redis unavailable for session %s", jti, exc_info=exc)
    raise ExternalServiceError(SESSION_UNAVAILABLE) from exc


class RedisSessionStore:
    """``SessionStore`` backed by Redis.

    Each token is the key ``session:<kind>:<jti>``. Each user has an index, the
    set ``user_sessions:<sub>`` whose members are ``<sid>:<kind>:<jti>``; it
    expires with the longest-lived token it lists.

    Unlike the cache, a Redis failure is raised, never treated as a miss: a
    session that cannot be checked must not be reported as revoked or valid.
    """

    def __init__(self, redis: Redis) -> None:
        self._redis = redis

    @staticmethod
    def _key(kind: TokenType, jti: str) -> str:
        return f"{KEY_PREFIX}{kind.value}:{jti}"

    @staticmethod
    def _index(sub: str) -> str:
        return f"{INDEX_PREFIX}{sub}"

    @staticmethod
    def _member(claims: SessionClaims) -> str:
        return f"{claims.sid}:{claims.type.value}:{claims.jti}"

    @staticmethod
    def _key_of_member(member: str) -> str:
        _, kind, jti = member.split(":", 2)
        return f"{KEY_PREFIX}{kind}:{jti}"

    async def save(self, claims: SessionClaims, ttl_seconds: int) -> None:
        index = self._index(claims.sub)
        try:
            async with self._redis.pipeline(transaction=True) as pipe:
                pipe.set(self._key(claims.type, claims.jti), "1", ex=ttl_seconds)
                pipe.sadd(index, self._member(claims))
                # A set without TTL counts as infinite for GT, so NX comes first.
                pipe.expire(index, ttl_seconds, nx=True)
                pipe.expire(index, ttl_seconds, gt=True)
                await pipe.execute()
        except RedisError as exc:
            _unavailable(claims.jti, exc)

    async def exists(self, kind: TokenType, jti: str) -> bool:
        try:
            return bool(await self._redis.exists(self._key(kind, jti)))
        except RedisError as exc:
            _unavailable(jti, exc)

    async def delete(self, claims: SessionClaims) -> bool:
        try:
            async with self._redis.pipeline(transaction=True) as pipe:
                pipe.delete(self._key(claims.type, claims.jti))
                pipe.srem(self._index(claims.sub), self._member(claims))
                deleted, _ = await pipe.execute()
            return bool(deleted)
        except RedisError as exc:
            _unavailable(claims.jti, exc)

    async def revoke_session(self, sub: str, sid: str) -> None:
        await self._revoke(sub, f"{sid}:")

    async def revoke_all(self, sub: str) -> None:
        await self._revoke(sub, "")

    async def _revoke(self, sub: str, member_prefix: str) -> None:
        index = self._index(sub)
        try:
            # The client is created with ``decode_responses=True`` (see main.py).
            listed = cast(set[str], await self._redis.smembers(index))
            members = [m for m in listed if m.startswith(member_prefix)]
            if not members:
                return
            # SREM (not DEL of the index) so a token saved meanwhile stays listed.
            async with self._redis.pipeline(transaction=True) as pipe:
                pipe.delete(*(self._key_of_member(m) for m in members))
                pipe.srem(index, *members)
                await pipe.execute()
        except RedisError as exc:
            logger.warning("Redis unavailable revoking sessions", exc_info=exc)
            raise ExternalServiceError(SESSION_UNAVAILABLE) from exc
