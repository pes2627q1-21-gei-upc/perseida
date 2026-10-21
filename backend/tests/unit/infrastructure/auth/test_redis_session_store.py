import logging
from datetime import UTC, datetime
from typing import Any, cast
from unittest.mock import AsyncMock, MagicMock

import pytest
from redis.exceptions import ConnectionError as RedisConnectionError

from app.application.auth.errors import SESSION_UNAVAILABLE
from app.application.shared.errors import ExternalServiceError
from app.domain.auth.models import SessionClaims, TokenType
from app.infrastructure.auth.redis_session_store import RedisSessionStore

EXP = datetime(2026, 10, 20, tzinfo=UTC)
ACCESS = SessionClaims(
    sub="g-1", jti="jti-1", sid="sid-1", type=TokenType.ACCESS, exp=EXP
)
REFRESH = SessionClaims(
    sub="g-1", jti="jti-2", sid="sid-1", type=TokenType.REFRESH, exp=EXP
)


def make_redis(execute_result: list[Any] | None = None) -> MagicMock:
    """A Redis whose ``pipeline()`` is an async context manager over ``pipe``."""
    pipe = MagicMock()
    pipe.execute = AsyncMock(return_value=execute_result or [])
    pipe.__aenter__ = AsyncMock(return_value=pipe)
    pipe.__aexit__ = AsyncMock(return_value=None)
    redis = MagicMock()
    redis.pipeline.return_value = pipe
    redis.pipe = pipe
    redis.exists = AsyncMock()
    redis.smembers = AsyncMock(return_value=set())
    return redis


def make_store(redis: MagicMock) -> RedisSessionStore:
    return RedisSessionStore(cast(Any, redis))


async def test_save_sets_the_key_and_indexes_it_by_user_in_one_transaction() -> None:
    redis = make_redis()

    await make_store(redis).save(ACCESS, 900)

    redis.pipeline.assert_called_once_with(transaction=True)
    pipe = redis.pipe
    pipe.set.assert_called_once_with("session:access:jti-1", "1", ex=900)
    pipe.sadd.assert_called_once_with("user_sessions:g-1", "sid-1:access:jti-1")
    assert [c.kwargs for c in pipe.expire.call_args_list] == [
        {"nx": True},
        {"gt": True},
    ]
    assert all(c.args == ("user_sessions:g-1", 900) for c in pipe.expire.call_args_list)
    pipe.execute.assert_awaited_once()


@pytest.mark.parametrize(("count", "expected"), [(1, True), (0, False)])
async def test_exists_checks_the_prefixed_key(count: int, expected: bool) -> None:
    redis = make_redis()
    redis.exists.return_value = count

    result = await make_store(redis).exists(TokenType.REFRESH, "jti-2")

    assert result is expected
    redis.exists.assert_awaited_once_with("session:refresh:jti-2")


@pytest.mark.parametrize(("deleted", "expected"), [(1, True), (0, False)])
async def test_delete_removes_key_and_index_entry_and_tells_who_revoked(
    deleted: int, expected: bool
) -> None:
    redis = make_redis([deleted, 1])

    result = await make_store(redis).delete(REFRESH)

    assert result is expected
    redis.pipe.delete.assert_called_once_with("session:refresh:jti-2")
    redis.pipe.srem.assert_called_once_with("user_sessions:g-1", "sid-1:refresh:jti-2")


async def test_revoke_session_removes_only_the_tokens_of_that_session() -> None:
    redis = make_redis()
    redis.smembers.return_value = {
        "sid-1:access:jti-1",
        "sid-1:refresh:jti-2",
        "sid-2:access:jti-3",
    }

    await make_store(redis).revoke_session("g-1", "sid-1")

    redis.smembers.assert_awaited_once_with("user_sessions:g-1")
    assert set(redis.pipe.delete.call_args.args) == {
        "session:access:jti-1",
        "session:refresh:jti-2",
    }
    assert set(redis.pipe.srem.call_args.args[1:]) == {
        "sid-1:access:jti-1",
        "sid-1:refresh:jti-2",
    }


async def test_revoke_all_removes_every_token_of_the_user() -> None:
    redis = make_redis()
    redis.smembers.return_value = {"sid-1:access:jti-1", "sid-2:refresh:jti-3"}

    await make_store(redis).revoke_all("g-1")

    assert set(redis.pipe.delete.call_args.args) == {
        "session:access:jti-1",
        "session:refresh:jti-3",
    }


async def test_revoking_a_user_without_sessions_does_nothing() -> None:
    redis = make_redis()

    await make_store(redis).revoke_all("g-1")

    redis.pipeline.assert_not_called()


@pytest.mark.parametrize(
    "operation", ["save", "exists", "delete", "revoke_session", "revoke_all"]
)
async def test_a_redis_failure_is_session_unavailable_and_never_logs_a_token(
    operation: str, caplog: pytest.LogCaptureFixture
) -> None:
    redis = make_redis()
    failure = RedisConnectionError("redis:6379 refused")
    redis.pipe.execute.side_effect = failure
    redis.exists.side_effect = failure
    redis.smembers.side_effect = failure
    store = make_store(redis)
    args = {
        "save": (ACCESS, 900),
        "exists": (TokenType.ACCESS, "jti-1"),
        "delete": (ACCESS,),
        "revoke_session": ("g-1", "sid-1"),
        "revoke_all": ("g-1",),
    }[operation]

    with caplog.at_level(logging.WARNING), pytest.raises(ExternalServiceError) as exc:
        await getattr(store, operation)(*args)

    assert exc.value.code == SESSION_UNAVAILABLE
    if operation in ("save", "exists", "delete"):
        assert "jti-1" in caplog.text or "jti-2" in caplog.text
