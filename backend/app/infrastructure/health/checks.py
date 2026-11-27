import logging

from redis.asyncio import Redis
from redis.exceptions import RedisError
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

logger = logging.getLogger(__name__)


class ApplicationCheck:
    """Liveness of the application process itself."""

    @property
    def name(self) -> str:
        return "app"

    @property
    def critical(self) -> bool:
        return True

    async def is_up(self) -> bool:
        return True


class PostgresCheck:
    """PostgreSQL answers a trivial query; without it the API cannot work."""

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    @property
    def name(self) -> str:
        return "postgres"

    @property
    def critical(self) -> bool:
        return True

    async def is_up(self) -> bool:
        try:
            async with self._session_factory() as session:
                await session.execute(select(1))
        except SQLAlchemyError, OSError:
            logger.warning("PostgreSQL health check failed", exc_info=True)
            return False
        return True


class RedisCheck:
    """Redis answers PING; it is optional because the API falls back without it."""

    def __init__(self, redis: Redis) -> None:
        self._redis = redis

    @property
    def name(self) -> str:
        return "redis"

    @property
    def critical(self) -> bool:
        return False

    async def is_up(self) -> bool:
        try:
            await self._redis.ping()
        except RedisError, OSError:
            logger.warning("Redis health check failed", exc_info=True)
            return False
        return True
