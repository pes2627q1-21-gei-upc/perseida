import json
import logging
from datetime import UTC, datetime
from typing import Any, cast
from unittest.mock import AsyncMock, MagicMock

import pytest
from redis.exceptions import ConnectionError as RedisConnectionError

from app.application.auth.errors import SESSION_UNAVAILABLE
from app.application.shared.errors import ExternalServiceError
from app.domain.auth.models import SessionClaims, TokenType
from app.domain.realtime.models import revocation_channel
from app.infrastructure.auth.redis_session_store import RedisSessionStore
from tests.fakes.pubsub import FakePubSub

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


def make_store(redis: MagicMock, pubsub: FakePubSub | None = None) -> RedisSessionStore:
    return RedisSessionStore(cast(Any, redis), pubsub or FakePubSub())


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


# --- TG-63 / US #63, tasca #425: revocation is announced on pub/sub ----------


async def test_revoke_session_publishes_the_sid_on_the_revocation_channel() -> None:
    redis = make_redis()
    redis.smembers.return_value = {"sid-1:access:jti-1", "sid-2:access:jti-3"}
    pubsub = FakePubSub()

    await make_store(redis, pubsub).revoke_session("g-1", "sid-1")

    assert [(c, json.loads(m)) for c, m in pubsub.published] == [
        (revocation_channel("g-1"), {"sid": "sid-1"})
    ]


async def test_revoke_all_publishes_a_null_sid() -> None:
    redis = make_redis()
    redis.smembers.return_value = {"sid-1:access:jti-1"}
    pubsub = FakePubSub()

    await make_store(redis, pubsub).revoke_all("g-1")

    assert [(c, json.loads(m)) for c, m in pubsub.published] == [
        (revocation_channel("g-1"), {"sid": None})
    ]


@pytest.mark.parametrize("operation", ["revoke_session", "revoke_all"])
async def test_it_publishes_even_when_the_user_index_is_empty(operation: str) -> None:
    redis = make_redis()
    pubsub = FakePubSub()
    args = ("g-1", "sid-1") if operation == "revoke_session" else ("g-1",)

    await getattr(make_store(redis, pubsub), operation)(*args)

    assert [c for c, _ in pubsub.published] == [revocation_channel("g-1")]


@pytest.mark.parametrize("operation", ["revoke_session", "revoke_all"])
async def test_it_publishes_only_after_the_keys_were_deleted(operation: str) -> None:
    redis = make_redis()
    redis.smembers.return_value = {"sid-1:access:jti-1"}
    events: list[str] = []

    async def execute() -> list[Any]:
        return await _record(events, "deleted")

    redis.pipe.execute.side_effect = execute
    pubsub = FakePubSub()
    original = pubsub.publish

    async def publish(channel: str, message: str) -> None:
        events.append("published")
        await original(channel, message)

    pubsub.publish = publish  # type: ignore[method-assign]
    args = ("g-1", "sid-1") if operation == "revoke_session" else ("g-1",)

    await getattr(make_store(redis, pubsub), operation)(*args)

    assert events == ["deleted", "published"]


async def _record(events: list[str], name: str) -> list[Any]:
    events.append(name)
    return []


@pytest.mark.parametrize("operation", ["revoke_session", "revoke_all"])
async def test_a_pubsub_failure_is_logged_and_never_raised(
    operation: str, caplog: pytest.LogCaptureFixture
) -> None:
    redis = make_redis()
    redis.smembers.return_value = {"sid-1:access:jti-1"}
    pubsub = FakePubSub()
    pubsub.fail(True)
    args = ("g-1", "sid-1") if operation == "revoke_session" else ("g-1",)

    with caplog.at_level(logging.WARNING):
        await getattr(make_store(redis, pubsub), operation)(*args)

    redis.pipe.delete.assert_called_once_with("session:access:jti-1")
    assert any(r.levelno == logging.WARNING for r in caplog.records)


@pytest.mark.parametrize("operation", ["revoke_session", "revoke_all"])
async def test_a_redis_failure_publishes_nothing(operation: str) -> None:
    redis = make_redis()
    redis.smembers.side_effect = RedisConnectionError("redis:6379 refused")
    pubsub = FakePubSub()
    args = ("g-1", "sid-1") if operation == "revoke_session" else ("g-1",)

    with pytest.raises(ExternalServiceError) as exc:
        await getattr(make_store(redis, pubsub), operation)(*args)

    assert exc.value.code == SESSION_UNAVAILABLE
    assert pubsub.published == []
