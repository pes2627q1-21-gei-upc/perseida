"""TG-65: a busy pair must not starve unrelated direct messages."""

import asyncio
import os
import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.infrastructure.direct_chat.outbox import BATCH_SIZE, DirectOutboxDispatcher
from app.infrastructure.direct_chat.repository import SqlDirectMessageRepository
from tests.integration.direct_chat.test_direct_chat_repository import engine as engine
from tests.integration.direct_chat.test_direct_chat_repository import sessions as sessions
from tests.integration.direct_chat.test_direct_outbox_integration import (
    RecordingBroadcaster,
    _preexisting_data_is_kept as _preexisting_data_is_kept,
    _schema_at_head as _schema_at_head,
    make_message,
    pending,
)

pytestmark = pytest.mark.skipif(not os.getenv("POSTGRES_HOST"), reason="PostgreSQL required")


async def test_tg65_locked_pair_cannot_starve_unrelated_pair_beyond_batch_size(
    engine: AsyncEngine, sessions: async_sessionmaker[AsyncSession]
) -> None:
    first = await make_message(sessions)
    # Every earlier id sorts before the unrelated message, as current queue does.
    busy = [first] + [first.model_copy(update={
        "id": uuid.uuid7(), "client_message_id": uuid.uuid4()
    }) for _ in range(BATCH_SIZE)]
    healthy = await make_message(sessions)
    assert max(message.id for message in busy) < healthy.id
    repository = SqlDirectMessageRepository(sessions)
    broadcaster = RecordingBroadcaster()
    try:
        for message in [*busy, healthy]:
            await repository.add(message)
        async with engine.connect() as lock_conn:
            async with lock_conn.begin():
                result = await lock_conn.execute(text(
                    "SELECT user_a_id, user_b_id FROM direct_conversations WHERE id = :id"
                ), {"id": first.conversation_id})
                a, b = result.one()
                key = ":".join(str(value) for value in sorted((a, b)))
                await lock_conn.execute(text(
                    "SELECT pg_advisory_xact_lock(hashtextextended(:pair, 0))"
                ), {"pair": key})
                dispatcher = DirectOutboxDispatcher(sessions, broadcaster)
                for _ in range(3):
                    await asyncio.wait_for(dispatcher.dispatch_once(), 5)
                assert [message.id for message in broadcaster.delivered] == [healthy.id]
                async with engine.connect() as conn:
                    assert await pending(conn, healthy.id) == 0
                    assert await pending(conn, first.id) == 1
    finally:
        async with engine.begin() as conn:
            for message in [*busy, healthy]:
                await conn.execute(text(
                    "DELETE FROM direct_message_outbox WHERE message_id = :id"
                ), {"id": message.id})
