from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from redis.asyncio import Redis
from redis.asyncio.client import PubSub as PubSubClient
from redis.exceptions import RedisError

from app.application.shared.errors import ExternalServiceError

PUBSUB_UNAVAILABLE = "PUBSUB_UNAVAILABLE"


class RedisPubSub:
    """``PubSub`` backed by Redis channels (the client decodes to ``str``)."""

    def __init__(self, redis: Redis) -> None:
        self._redis = redis

    async def publish(self, channel: str, message: str) -> None:
        try:
            await self._redis.publish(channel, message)
        except RedisError as exc:
            raise ExternalServiceError(PUBSUB_UNAVAILABLE, str(exc)) from exc

    @asynccontextmanager
    async def subscribe(self, channel: str) -> AsyncIterator[AsyncIterator[str]]:
        async with self._redis.pubsub() as pubsub:
            try:
                await pubsub.subscribe(channel)
            except RedisError as exc:
                raise ExternalServiceError(PUBSUB_UNAVAILABLE, str(exc)) from exc
            yield self._messages(pubsub)

    @staticmethod
    async def _messages(pubsub: PubSubClient) -> AsyncIterator[str]:
        async for item in pubsub.listen():
            if item["type"] == "message":
                yield str(item["data"])
