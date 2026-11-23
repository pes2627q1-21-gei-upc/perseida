"""TG-65: the total private-channel fan-out holds locks for bounded time."""

import asyncio
import os
import uuid

import pytest
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.application.shared.error_codes import PUBSUB_UNAVAILABLE
from app.application.shared.errors import ExternalServiceError
from app.domain.direct_chat.models import UserBlock
from app.infrastructure.cache.redis_pubsub import RedisPubSub
from app.infrastructure.direct_chat.broadcaster import DirectMessagePubSubBroadcaster
from app.infrastructure.direct_chat.outbox import DirectOutboxDispatcher
from app.infrastructure.direct_chat.repository import (
    SqlDirectConversationRepository,
    SqlDirectMessageRepository,
    SqlUserBlockRepository,
)
from tests.integration.direct_chat.test_direct_chat_repository import engine as engine
from tests.integration.direct_chat.test_direct_chat_repository import (
    sessions as sessions,
)
from tests.integration.direct_chat.test_direct_outbox_integration import make_message

pytestmark = pytest.mark.skipif(
    not os.getenv("POSTGRES_HOST"),
    reason="PostgreSQL integration test requires its host",
)


class StalledPublisher:
    def __init__(self, stall_at: int) -> None:
        self.stall_at = stall_at
        self.calls = 0
        self.started = asyncio.Event()
        self.cancelled = asyncio.Event()
        self.release = asyncio.Event()

    async def publish_counted(self, channel: str, message: str) -> int:
        self.calls += 1
        if self.calls == self.stall_at:
            self.started.set()
            try:
                await self.release.wait()
            finally:
                self.cancelled.set()
        return 1


@pytest.mark.parametrize("stall_at", [1, 2])
async def test_tg65_a_stalled_fanout_returns_controlled_error(
    sessions: async_sessionmaker[AsyncSession], stall_at: int
) -> None:
    message = await make_message(sessions)
    publisher = StalledPublisher(stall_at)
    broadcaster = DirectMessagePubSubBroadcaster(publisher, timeout_seconds=0.05)

    with pytest.raises(ExternalServiceError) as error:
        await asyncio.wait_for(
            broadcaster.deliver(message, recipient_id=uuid.uuid7(), origin=None), 2
        )

    assert error.value.code == PUBSUB_UNAVAILABLE
    assert publisher.calls == stall_at
    assert publisher.cancelled.is_set()


async def test_tg65_cancellation_is_not_translated_to_timeout(
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    message = await make_message(sessions)
    publisher = StalledPublisher(1)
    broadcaster = DirectMessagePubSubBroadcaster(publisher, timeout_seconds=2.0)
    task = asyncio.create_task(
        broadcaster.deliver(message, recipient_id=uuid.uuid7(), origin=None)
    )
    await asyncio.wait_for(publisher.started.wait(), 2)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert publisher.cancelled.is_set()


async def test_tg65_unavailable_redis_is_a_controlled_failure(
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    message = await make_message(sessions)
    redis = Redis(host="127.0.0.1", port=1, socket_connect_timeout=0.2)
    try:
        broadcaster = DirectMessagePubSubBroadcaster(
            RedisPubSub(redis), timeout_seconds=0.2
        )
        with pytest.raises(ExternalServiceError) as error:
            await asyncio.wait_for(
                broadcaster.deliver(message, recipient_id=uuid.uuid7(), origin=None), 2
            )
        assert error.value.code == PUBSUB_UNAVAILABLE
    finally:
        await redis.aclose()


async def test_tg65_stalled_fanout_releases_pair_lock_for_block(
    engine: AsyncEngine, sessions: async_sessionmaker[AsyncSession]
) -> None:
    message = await make_message(sessions)
    conversations = SqlDirectConversationRepository(sessions)
    conversation = await conversations.get(message.conversation_id)
    assert conversation is not None
    recipient = conversation.other_participant(message.sender_id)
    messages = SqlDirectMessageRepository(sessions)
    await messages.add(message)
    publisher = StalledPublisher(1)
    broadcaster = DirectMessagePubSubBroadcaster(publisher, timeout_seconds=0.05)
    dispatcher = DirectOutboxDispatcher(sessions, broadcaster)
    dispatch_task = asyncio.create_task(dispatcher.dispatch_once())
    blocker: asyncio.Task[None] | None = None
    try:
        await asyncio.wait_for(publisher.started.wait(), 2)
        blocker = asyncio.create_task(
            SqlUserBlockRepository(sessions).block(
                UserBlock.create(recipient, message.sender_id)
            )
        )
        # The dispatcher and blocker use different factory-created connections.
        await asyncio.wait_for(dispatch_task, 2)
        await asyncio.wait_for(blocker, 2)
        assert publisher.cancelled.is_set()
        assert (
            await messages.find_by_client_id(
                message.sender_id, message.client_message_id
            )
            == message
        )
        assert await SqlUserBlockRepository(sessions).is_blocked(
            recipient, message.sender_id
        )
    finally:
        dispatch_task.cancel()
        if blocker is not None:
            blocker.cancel()
        await asyncio.gather(
            dispatch_task, *([blocker] if blocker else []), return_exceptions=True
        )
