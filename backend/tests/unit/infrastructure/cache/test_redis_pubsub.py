from typing import Any, cast
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from redis.exceptions import ConnectionError as RedisConnectionError
from starlette.requests import HTTPConnection

from app.application.shared.errors import ExternalServiceError
from app.infrastructure.cache.dependencies import get_pubsub
from app.infrastructure.cache.redis_pubsub import RedisPubSub


async def _listen() -> Any:
    yield {"type": "subscribe", "data": 1}
    yield {"type": "message", "data": "hola"}
    yield {"type": "message", "data": "adeu"}


def _redis() -> MagicMock:
    pubsub = MagicMock()
    pubsub.subscribe = AsyncMock()
    pubsub.__aenter__ = AsyncMock(return_value=pubsub)
    pubsub.__aexit__ = AsyncMock(return_value=None)
    pubsub.listen = _listen
    redis = MagicMock()
    redis.publish = AsyncMock()
    redis.pubsub.return_value = pubsub
    return redis


async def test_tg147_publish_sends_to_the_channel() -> None:
    redis = _redis()

    await RedisPubSub(cast(Any, redis)).publish("chat:1", "hola")

    redis.publish.assert_awaited_once_with("chat:1", "hola")


async def test_tg147_publish_failure_is_an_external_service_error() -> None:
    redis = _redis()
    redis.publish.side_effect = RedisConnectionError("down")

    with pytest.raises(ExternalServiceError) as exc_info:
        await RedisPubSub(cast(Any, redis)).publish("chat:1", "hola")

    assert exc_info.value.code == "PUBSUB_UNAVAILABLE"


async def test_tg147_subscribe_yields_only_messages_and_cleans_up() -> None:
    redis = _redis()
    pubsub = redis.pubsub.return_value

    async with RedisPubSub(cast(Any, redis)).subscribe("chat:1") as messages:
        received = [message async for message in messages]

    assert received == ["hola", "adeu"]
    pubsub.subscribe.assert_awaited_once_with("chat:1")
    pubsub.__aexit__.assert_awaited_once()


async def test_tg147_subscribe_failure_is_an_external_service_error() -> None:
    redis = _redis()
    pubsub = redis.pubsub.return_value
    pubsub.subscribe.side_effect = RedisConnectionError("down")

    with pytest.raises(ExternalServiceError):
        async with RedisPubSub(cast(Any, redis)).subscribe("chat:1"):
            pass

    pubsub.__aexit__.assert_awaited_once()


def test_tg147_get_pubsub_builds_the_adapter_from_app_state() -> None:
    app = FastAPI()
    app.state.redis = _redis()
    conn = HTTPConnection({"type": "http", "app": app, "headers": []})

    assert isinstance(get_pubsub(conn), RedisPubSub)
