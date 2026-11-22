"""TG-65: offline push is attempted by the dispatcher after commit."""

import os
import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession, async_sessionmaker

from app.domain.direct_chat.models import DirectMessage
from app.infrastructure.direct_chat.outbox import DirectOutboxDispatcher
from app.infrastructure.direct_chat.repository import SqlDirectMessageRepository
from tests.integration.direct_chat.test_direct_outbox_integration import (
    RecordingBroadcaster,
    _preexisting_data_is_kept as _preexisting_data_is_kept,
    _schema_at_head as _schema_at_head,
    connection as connection,
    factory as factory,
    make_message,
    pending,
)

pytestmark = pytest.mark.skipif(
    not os.getenv("POSTGRES_HOST"), reason="PostgreSQL integration test requires its host"
)


class OfflineBroadcaster(RecordingBroadcaster):
    async def deliver(
        self, message: DirectMessage, *, recipient_id: uuid.UUID, origin: str | None
    ) -> int:
        await super().deliver(message, recipient_id=recipient_id, origin=origin)
        return 0


class RecordingPush:
    def __init__(self, *, fail: bool = False) -> None:
        self.fail = fail
        self.sent: list[tuple[uuid.UUID, DirectMessage]] = []

    async def notify(self, recipient_id: uuid.UUID, message: DirectMessage) -> None:
        if self.fail:
            raise RuntimeError("synthetic failure")
        self.sent.append((recipient_id, message))


@pytest.mark.parametrize("push_failure", [False, True])
async def test_tg65_offline_push_is_best_effort_after_delivery(
    connection: AsyncConnection,
    factory: async_sessionmaker[AsyncSession],
    push_failure: bool,
) -> None:
    message = await make_message(factory)
    await SqlDirectMessageRepository(factory).add(message)
    broadcaster = OfflineBroadcaster()
    push = RecordingPush(fail=push_failure)

    await DirectOutboxDispatcher(factory, broadcaster, push).dispatch_once()

    assert await pending(connection, message.id) == 0
    assert [item.id for item in broadcaster.delivered] == [message.id]
    assert [item.id for _, item in push.sent] == ([] if push_failure else [message.id])
