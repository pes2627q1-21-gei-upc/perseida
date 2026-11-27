"""TG-65: outbox cancellation and forward progress against PostgreSQL."""

import os
import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession, async_sessionmaker

from app.application.shared.error_codes import PUBSUB_UNAVAILABLE
from app.application.shared.errors import ExternalServiceError
from app.domain.direct_chat.models import DirectMessage, UserBlock
from app.infrastructure.direct_chat.outbox import DirectOutboxDispatcher
from app.infrastructure.direct_chat.repository import (
    SqlDirectConversationRepository,
    SqlDirectMessageRepository,
    SqlUserBlockRepository,
)
from tests.integration.direct_chat.test_direct_outbox_integration import (
    RecordingBroadcaster,
    make_message,
    pending,
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

pytestmark = pytest.mark.skipif(
    not os.getenv("POSTGRES_HOST"),
    reason="PostgreSQL integration test requires its host",
)


async def test_tg65_block_then_unblock_never_releases_cancelled_message(
    connection: AsyncConnection, factory: async_sessionmaker[AsyncSession]
) -> None:
    message = await make_message(factory)
    messages = SqlDirectMessageRepository(factory)
    conversation = await SqlDirectConversationRepository(factory).get(
        message.conversation_id
    )
    assert conversation is not None
    recipient = conversation.other_participant(message.sender_id)
    blocks = SqlUserBlockRepository(factory)
    await messages.add(message)
    await blocks.block(UserBlock.create(recipient, message.sender_id))
    await blocks.unblock(recipient, message.sender_id)
    broadcaster = RecordingBroadcaster()

    await DirectOutboxDispatcher(factory, broadcaster).dispatch_once()

    assert broadcaster.delivered == []
    assert await pending(connection, message.id) == 0
    assert (
        await messages.find_by_client_id(message.sender_id, message.client_message_id)
        == message
    )


class SelectivelyFailingBroadcaster(RecordingBroadcaster):
    def __init__(self, rejected: uuid.UUID) -> None:
        super().__init__()
        self.rejected = rejected
        self.attempted: list[uuid.UUID] = []

    async def deliver(
        self, message: DirectMessage, *, recipient_id: uuid.UUID, origin: str | None
    ) -> int:
        self.attempted.append(message.id)
        if message.id == self.rejected:
            raise ExternalServiceError(PUBSUB_UNAVAILABLE)
        return await super().deliver(message, recipient_id=recipient_id, origin=origin)


async def test_tg65_a_permanent_item_failure_does_not_starve_other_messages(
    connection: AsyncConnection, factory: async_sessionmaker[AsyncSession]
) -> None:
    one, two = await make_message(factory), await make_message(factory)
    failed, healthy = sorted((one, two), key=lambda message: message.id)
    messages = SqlDirectMessageRepository(factory)
    await messages.add(failed)
    await messages.add(healthy)
    broadcaster = SelectivelyFailingBroadcaster(failed.id)
    dispatcher = DirectOutboxDispatcher(factory, broadcaster)

    for _ in range(3):
        await dispatcher.dispatch_once()

    assert failed.id in broadcaster.attempted
    assert [message.id for message in broadcaster.delivered] == [healthy.id]
    assert await pending(connection, healthy.id) == 0
    assert (
        await messages.find_by_client_id(failed.sender_id, failed.client_message_id)
        == failed
    )


async def test_tg65_worker_drains_pending_items_before_sleeping(
    connection: AsyncConnection,
    factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    messages = [await make_message(factory), await make_message(factory)]
    repository = SqlDirectMessageRepository(factory)
    for message in messages:
        await repository.add(message)
    broadcaster = RecordingBroadcaster()
    dispatcher = DirectOutboxDispatcher(factory, broadcaster)

    class FirstSleepError(Exception):
        pass

    async def stop_at_first_sleep(_seconds: float) -> None:
        raise FirstSleepError

    # The first idle wait is our deterministic observation point; no real delay.
    monkeypatch.setattr(
        "app.infrastructure.direct_chat.outbox.asyncio.sleep", stop_at_first_sleep
    )
    with pytest.raises(FirstSleepError):
        await dispatcher.run()

    assert {message.id for message in broadcaster.delivered} == {
        message.id for message in messages
    }
    for message in messages:
        assert await pending(connection, message.id) == 0


async def test_tg65_a_message_sent_after_a_failing_one_is_still_delivered(
    connection: AsyncConnection, factory: async_sessionmaker[AsyncSession]
) -> None:
    failed, late = await make_message(factory), await make_message(factory)
    messages = SqlDirectMessageRepository(factory)
    await messages.add(failed)
    broadcaster = SelectivelyFailingBroadcaster(failed.id)
    dispatcher = DirectOutboxDispatcher(factory, broadcaster)
    for _ in range(3):
        await dispatcher.dispatch_once()  # the failing item now has attempts > 0

    await messages.add(late)  # attempts == 0, below the failing item's key
    for _ in range(3):
        await dispatcher.dispatch_once()

    assert [message.id for message in broadcaster.delivered] == [late.id]
    assert await pending(connection, late.id) == 0
    assert await pending(connection, failed.id) == 1
