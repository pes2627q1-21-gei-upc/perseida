"""Health check adapters. US TG-49 (criterion 5: they implement HealthCheck).

PostgresCheck and RedisCheck are covered against real servers in
tests/integration/test_health_api.py; here, their contract and how RedisCheck
reports a failing PING.
"""

import pytest
from redis.asyncio import Redis
from redis.exceptions import ConnectionError as RedisConnectionError
from redis.exceptions import TimeoutError as RedisTimeoutError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.domain.health.ports import HealthCheck
from app.infrastructure.health.checks import (
    ApplicationCheck,
    PostgresCheck,
    RedisCheck,
)

# Clients are lazy: nothing connects to these ports unless a test pings.
UNUSED_POSTGRES_URL = "postgresql+asyncpg://test:test@127.0.0.1:1/test"


def _session_factory() -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(create_async_engine(UNUSED_POSTGRES_URL))


def _redis(monkeypatch: pytest.MonkeyPatch, error: Exception | None) -> Redis:
    redis = Redis(host="127.0.0.1", port=1)

    async def ping() -> bool:
        if error:
            raise error
        return True

    monkeypatch.setattr(redis, "ping", ping)
    return redis


def test_tg49_c5_application_check_is_critical() -> None:
    check: HealthCheck = ApplicationCheck()

    assert check.name == "app"
    assert check.critical is True


def test_tg49_c1_postgres_check_is_critical_and_named_postgres() -> None:
    check: HealthCheck = PostgresCheck(_session_factory())

    assert check.name == "postgres"
    assert check.critical is True


def test_tg49_c2_redis_check_is_not_critical_and_named_redis(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    check: HealthCheck = RedisCheck(_redis(monkeypatch, None))

    assert check.name == "redis"
    assert check.critical is False


async def test_tg49_c2_redis_check_is_up_when_ping_answers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    assert await RedisCheck(_redis(monkeypatch, None)).is_up() is True


@pytest.mark.parametrize(
    "error",
    [RedisConnectionError("connection refused"), RedisTimeoutError("timeout")],
    ids=["refused", "timeout"],
)
async def test_tg49_c2_redis_check_is_down_when_ping_fails(
    monkeypatch: pytest.MonkeyPatch, error: Exception
) -> None:
    assert await RedisCheck(_redis(monkeypatch, error)).is_up() is False
