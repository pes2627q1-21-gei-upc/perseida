import logging
from typing import Any, cast
from unittest.mock import AsyncMock

import pytest
from redis.exceptions import ConnectionError as RedisConnectionError

from app.application.auth.errors import SESSION_UNAVAILABLE
from app.application.shared.errors import ExternalServiceError
from app.domain.auth.models import TokenType
from app.infrastructure.auth.redis_session_store import RedisSessionStore


def make_store(redis: AsyncMock) -> RedisSessionStore:
    return RedisSessionStore(cast(Any, redis))


async def test_save_sets_the_prefixed_key_with_the_ttl() -> None:
    redis = AsyncMock()

    await make_store(redis).save(TokenType.ACCESS, "jti-1", 900)

    redis.set.assert_awaited_once_with("session:access:jti-1", "1", ex=900)


@pytest.mark.parametrize(("count", "expected"), [(1, True), (0, False)])
async def test_exists_checks_the_prefixed_key(count: int, expected: bool) -> None:
    redis = AsyncMock()
    redis.exists.return_value = count

    result = await make_store(redis).exists(TokenType.REFRESH, "jti-2")

    assert result is expected
    redis.exists.assert_awaited_once_with("session:refresh:jti-2")


async def test_delete_removes_the_prefixed_key() -> None:
    redis = AsyncMock()

    await make_store(redis).delete(TokenType.REFRESH, "jti-2")

    redis.delete.assert_awaited_once_with("session:refresh:jti-2")


@pytest.mark.parametrize("operation", ["save", "exists", "delete"])
async def test_a_redis_failure_is_session_unavailable_and_never_logs_a_token(
    operation: str, caplog: pytest.LogCaptureFixture
) -> None:
    redis = AsyncMock()
    for command in (redis.set, redis.exists, redis.delete):
        command.side_effect = RedisConnectionError("redis:6379 refused")
    store = make_store(redis)
    args = (TokenType.ACCESS, "jti-1") + ((900,) if operation == "save" else ())

    with caplog.at_level(logging.WARNING), pytest.raises(ExternalServiceError) as exc:
        await getattr(store, operation)(*args)

    assert exc.value.code == SESSION_UNAVAILABLE
    assert "jti-1" in caplog.text
