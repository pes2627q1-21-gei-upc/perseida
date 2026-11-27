"""TG-65: recipient subscriptions and offline push with PostgreSQL and Redis."""

import asyncio
import json
import os
import uuid
from contextlib import AsyncExitStack

import pytest
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession, async_sessionmaker

from app.domain.direct_chat.models import DirectMessage
from app.domain.realtime.models import direct_user_channel
from app.infrastructure.cache.config import RedisSettings
from app.infrastructure.cache.redis_pubsub import RedisPubSub
from app.infrastructure.direct_chat.broadcaster import DirectMessagePubSubBroadcaster
from app.infrastructure.direct_chat.outbox import DirectOutboxDispatcher
from app.infrastructure.direct_chat.push_notifier import NoopPushNotifier
from app.infrastructure.direct_chat.repository import (
    SqlDirectConversationRepository,
    SqlDirectMessageRepository,
)
from tests.integration.direct_chat.test_direct_outbox_integration import (
    _preexisting_data_is_kept as _preexisting_data_is_kept,
)
from tests.integration.direct_chat.test_direct_outbox_integration import (
    _schema_at_head as _schema_at_head,
)
from tests.integration.direct_chat.test_direct_outbox_integration import (
    connection as connection,
)
from tests.integration.direct_chat.test_direct_outbox_integration import (
    factory as factory,
)
from tests.integration.direct_chat.test_direct_outbox_integration import (
    make_message,
    pending,
)

pytestmark = pytest.mark.skipif(
    not (os.getenv("POSTGRES_HOST") and os.getenv("REDIS_HOST")),
    reason="PostgreSQL and Redis required",
)


class ObservedNoopPush(NoopPushNotifier):
    def __init__(self) -> None:
        self.calls: list[tuple[uuid.UUID, DirectMessage]] = []

    async def notify(self, recipient_id: uuid.UUID, message: DirectMessage) -> None:
        self.calls.append((recipient_id, message))
        await super().notify(recipient_id, message)


@pytest.mark.parametrize(
    "recipient_connections,sender_connections", [(0, 0), (0, 1), (1, 1), (2, 1)]
)
async def test_tg65_recipient_subscriber_count_controls_offline_push(
    recipient_connections: int,
    sender_connections: int,
    connection: AsyncConnection,
    factory: async_sessionmaker[AsyncSession],
    redis: Redis,
) -> None:
    message = await make_message(factory)
    conversation = await SqlDirectConversationRepository(factory).get(
        message.conversation_id
    )
    assert conversation is not None
    recipient = conversation.other_participant(message.sender_id)
    await SqlDirectMessageRepository(factory).add(message)
    pubsub = RedisPubSub(redis)
    broadcaster = DirectMessagePubSubBroadcaster(
        pubsub, timeout_seconds=RedisSettings().redis_socket_timeout_seconds
    )
    push = ObservedNoopPush()

    async with AsyncExitStack() as stack:
        recipient_streams = [
            await stack.enter_async_context(
                pubsub.subscribe(direct_user_channel(recipient))
            )
            for _ in range(recipient_connections)
        ]
        sender_streams = [
            await stack.enter_async_context(
                pubsub.subscribe(direct_user_channel(message.sender_id))
            )
            for _ in range(sender_connections)
        ]
        await DirectOutboxDispatcher(factory, broadcaster, push).dispatch_once()

        for stream in [*recipient_streams, *sender_streams]:
            envelope = json.loads(await asyncio.wait_for(anext(stream), 5))
            assert envelope["frame"]["payload"]["id"] == str(message.id)
        assert push.calls == (
            [(recipient, message)] if recipient_connections == 0 else []
        )
        assert await pending(connection, message.id) == 0


@pytest.mark.parametrize("recipient_connections", [0, 1, 2])
async def test_tg65_broadcaster_reports_recipient_subscribers_only(
    recipient_connections: int, factory: async_sessionmaker[AsyncSession], redis: Redis
) -> None:
    message = await make_message(factory)
    conversation = await SqlDirectConversationRepository(factory).get(
        message.conversation_id
    )
    assert conversation is not None
    recipient = conversation.other_participant(message.sender_id)
    pubsub = RedisPubSub(redis)
    async with AsyncExitStack() as stack:
        for _ in range(recipient_connections):
            await stack.enter_async_context(
                pubsub.subscribe(direct_user_channel(recipient))
            )
        await stack.enter_async_context(
            pubsub.subscribe(direct_user_channel(message.sender_id))
        )
        count = await DirectMessagePubSubBroadcaster(
            pubsub, timeout_seconds=RedisSettings().redis_socket_timeout_seconds
        ).deliver(message, recipient_id=recipient, origin=None)
    assert count == recipient_connections
