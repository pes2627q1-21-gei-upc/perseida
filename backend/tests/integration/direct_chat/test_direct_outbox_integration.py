"""TG-65 outbox integration proposal, against PostgreSQL.

Proposed adapter contract: ``SqlDirectMessageRepository.add`` atomically adds
the message and a row in ``direct_message_outbox`` with ``message_id`` and
nullable ``delivered_at``. ``DirectOutboxDispatcher(factory, broadcaster)``
exposes ``dispatch_once()`` and removes or marks completed/cancelled entries.
Imports deliberately fail until that adapter exists; this is a TDD draft.
"""

import asyncio
import os
import uuid
from datetime import UTC, datetime

import pytest
from redis.asyncio import Redis
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import (
    AsyncConnection,
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
)

from app.application.direct_chat.direct_chat_service import DirectChatService
from app.application.shared.error_codes import PUBSUB_UNAVAILABLE
from app.application.shared.errors import ExternalServiceError
from app.domain.direct_chat.models import DirectMessage, UserBlock
from app.infrastructure.chat.moderator import ApproveAllModerator
from app.infrastructure.chat.rate_limiter import RedisSendRateLimiter
from app.infrastructure.direct_chat.outbox import DirectOutboxDispatcher
from app.infrastructure.direct_chat.push_notifier import NoopPushNotifier
from app.infrastructure.direct_chat.repository import (
    SqlDirectConversationRepository,
    SqlDirectMessageRepository,
    SqlUserBlockRepository,
)
from app.infrastructure.direct_chat.user_directory import SqlChatUserDirectory
from tests.integration.chat.test_chat_api import (
    _preexisting_data_is_kept as _preexisting_data_is_kept,
)
from tests.integration.chat.test_chat_api import _schema_at_head as _schema_at_head
from tests.integration.chat.test_chat_api import connection as connection
from tests.integration.chat.test_chat_api import factory as factory
from tests.integration.direct_chat.test_direct_chat_repository import _pair
from tests.integration.direct_chat.test_direct_chat_repository import engine as engine
from tests.integration.direct_chat.test_direct_chat_repository import (
    sessions as sessions,
)

pytestmark = pytest.mark.skipif(
    not os.getenv("POSTGRES_HOST"),
    reason="PostgreSQL integration test requires its host",
)


class RecordingBroadcaster:
    def __init__(self) -> None:
        self.available = True
        self.delivered: list[DirectMessage] = []

    async def deliver(
        self, message: DirectMessage, *, recipient_id: uuid.UUID, origin: str | None
    ) -> int:
        if not self.available:
            raise ExternalServiceError(PUBSUB_UNAVAILABLE)
        self.delivered.append(message)
        return 1


async def make_message(factory: async_sessionmaker[AsyncSession]) -> DirectMessage:
    sender, recipient = await _pair(factory)
    conversation, _ = await SqlDirectConversationRepository(factory).get_or_create(
        sender.id, recipient.id
    )
    return DirectMessage(
        id=uuid.uuid7(),
        conversation_id=conversation.id,
        sender_id=sender.id,
        text="hello",
        sent_at=datetime.now(UTC),
        client_message_id=uuid.uuid4(),
    )


async def pending(connection: AsyncConnection, message_id: uuid.UUID) -> int:
    return int(
        await connection.scalar(
            text(
                "SELECT count(*) FROM direct_message_outbox "
                "WHERE message_id = :id AND delivered_at IS NULL"
            ),
            {"id": message_id},
        )
        or 0
    )


async def test_tg65_unavailable_redis_limiter_does_not_store_or_publish(
    connection: AsyncConnection, factory: async_sessionmaker[AsyncSession]
) -> None:
    message = await make_message(factory)
    # A real Redis client against a closed port exercises the real error mapping.
    unavailable = Redis(host="127.0.0.1", port=1, socket_connect_timeout=0.2)
    broadcaster = RecordingBroadcaster()
    service = DirectChatService(
        SqlDirectConversationRepository(factory),
        SqlDirectMessageRepository(factory),
        SqlUserBlockRepository(factory),
        SqlChatUserDirectory(factory),
        RedisSendRateLimiter(unavailable),
        ApproveAllModerator(),
        broadcaster,
        NoopPushNotifier(),
    )
    try:
        with pytest.raises(ExternalServiceError) as error:
            await service.send_message(
                message.sender_id,
                message.conversation_id,
                message.text,
                client_message_id=message.client_message_id,
            )
    finally:
        await unavailable.aclose()
    assert error.value.code == PUBSUB_UNAVAILABLE
    assert (
        await connection.scalar(
            text("SELECT count(*) FROM direct_messages WHERE sender_id = :sender"),
            {"sender": message.sender_id},
        )
        == 0
    )
    assert broadcaster.delivered == []


async def test_tg65_outbox_insert_failure_rolls_back_message(
    connection: AsyncConnection, factory: async_sessionmaker[AsyncSession]
) -> None:
    message = await make_message(factory)
    # One transaction: PostgreSQL undoes this temporary constraint at test teardown.
    await connection.execute(
        text(
            "ALTER TABLE direct_message_outbox ADD CONSTRAINT tg65_reject_event "
            "CHECK (message_id <> '" + str(message.id) + "'::uuid)"
        )
    )

    # Constraint violations remain IntegrityError: database_errors maps only
    # connection failures, not broken integrity constraints.
    with pytest.raises(IntegrityError):
        await SqlDirectMessageRepository(factory).add(message)

    assert (
        await connection.scalar(
            text("SELECT count(*) FROM direct_messages WHERE id = :id"),
            {"id": message.id},
        )
        == 0
    )
    assert await pending(connection, message.id) == 0


async def test_tg65_pending_message_retried_after_broker_recovers(
    connection: AsyncConnection, factory: async_sessionmaker[AsyncSession]
) -> None:
    message = await make_message(factory)
    await SqlDirectMessageRepository(factory).add(message)
    broadcaster = RecordingBroadcaster()
    broadcaster.available = False
    dispatcher = DirectOutboxDispatcher(factory, broadcaster)

    await dispatcher.dispatch_once()

    assert await pending(connection, message.id) == 1
    assert broadcaster.delivered == []
    broadcaster.available = True
    await dispatcher.dispatch_once()
    assert await pending(connection, message.id) == 0
    assert [item.id for item in broadcaster.delivered] == [message.id]


async def test_tg65_block_cancels_pending_delivery_without_deleting_history(
    connection: AsyncConnection, factory: async_sessionmaker[AsyncSession]
) -> None:
    message = await make_message(factory)
    conversations = SqlDirectConversationRepository(factory)
    conversation = await conversations.get(message.conversation_id)
    assert conversation is not None
    recipient = conversation.other_participant(message.sender_id)
    messages = SqlDirectMessageRepository(factory)
    await messages.add(message)
    await SqlUserBlockRepository(factory).block(
        UserBlock.create(recipient, message.sender_id)
    )
    broadcaster = RecordingBroadcaster()

    await DirectOutboxDispatcher(factory, broadcaster).dispatch_once()

    assert broadcaster.delivered == []
    assert await pending(connection, message.id) == 0
    assert (
        await messages.find_by_client_id(message.sender_id, message.client_message_id)
        == message
    )


async def test_tg65_committed_block_before_dispatch_suppresses_delivery(
    engine: AsyncEngine, sessions: async_sessionmaker[AsyncSession]
) -> None:
    # Separate committed transactions: unlike factory's shared savepoint,
    # the dispatcher observes the same state as another application instance.
    message = await make_message(sessions)
    conversation = await SqlDirectConversationRepository(sessions).get(
        message.conversation_id
    )
    assert conversation is not None
    recipient = conversation.other_participant(message.sender_id)
    messages = SqlDirectMessageRepository(sessions)
    await messages.add(message)
    broadcaster = RecordingBroadcaster()
    blocked = asyncio.Event()

    async def block() -> None:
        await SqlUserBlockRepository(sessions).block(
            UserBlock.create(recipient, message.sender_id)
        )
        blocked.set()  # block() returned after its commit

    async def dispatch() -> None:
        await blocked.wait()
        await DirectOutboxDispatcher(sessions, broadcaster).dispatch_once()

    try:
        await asyncio.gather(block(), dispatch())
        assert broadcaster.delivered == []
        async with engine.connect() as connection:
            assert await pending(connection, message.id) == 0
        assert (
            await messages.find_by_client_id(
                message.sender_id, message.client_message_id
            )
            == message
        )
    finally:
        async with engine.begin() as connection:
            await connection.execute(
                text("DELETE FROM direct_message_outbox WHERE message_id = :id"),
                {"id": message.id},
            )
