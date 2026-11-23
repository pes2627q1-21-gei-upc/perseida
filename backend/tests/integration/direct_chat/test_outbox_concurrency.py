"""TG-65: ordering of blocking and publication with real PostgreSQL locks."""

import asyncio
import os
import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.domain.direct_chat.models import DirectMessage, UserBlock
from app.infrastructure.direct_chat.outbox import DirectOutboxDispatcher
from app.infrastructure.direct_chat.repository import (
    SqlDirectConversationRepository,
    SqlDirectMessageRepository,
    SqlUserBlockRepository,
)
from app.infrastructure.persistence.config import DatabaseSettings
from tests.integration.direct_chat.test_direct_chat_repository import engine as engine
from tests.integration.direct_chat.test_direct_chat_repository import (
    sessions as sessions,
)
from tests.integration.direct_chat.test_direct_outbox_integration import (
    _preexisting_data_is_kept as _preexisting_data_is_kept,
)
from tests.integration.direct_chat.test_direct_outbox_integration import (
    _schema_at_head as _schema_at_head,
)
from tests.integration.direct_chat.test_direct_outbox_integration import (
    make_message,
    pending,
)

pytestmark = pytest.mark.skipif(
    not os.getenv("POSTGRES_HOST"), reason="PostgreSQL required"
)


class PausedBroadcaster:
    def __init__(self) -> None:
        self.entered = asyncio.Event()
        self.release = asyncio.Event()
        self.delivered: list[uuid.UUID] = []

    async def deliver(
        self, message: DirectMessage, *, recipient_id: uuid.UUID, origin: str | None
    ) -> int:
        self.entered.set()
        await self.release.wait()
        self.delivered.append(message.id)
        return 1


async def wait_for_advisory_wait(engine: AsyncEngine, application_name: str) -> None:
    # Observe PostgreSQL, not task scheduling: the block transaction has reached
    # its advisory lock and is waiting for the dispatcher transaction to commit.
    async with asyncio.timeout(5):
        while True:
            async with engine.connect() as conn:
                waiting = await conn.scalar(
                    text(
                        "SELECT EXISTS (SELECT 1 FROM pg_stat_activity "
                        "WHERE application_name = :name AND wait_event_type = 'Lock' "
                        "AND query LIKE '%pg_advisory_xact_lock%')"
                    ),
                    {"name": application_name},
                )
            if waiting:
                return
            await asyncio.sleep(0.01)


async def test_tg65_block_waits_for_inflight_publication_to_finish(
    engine: AsyncEngine, sessions: async_sessionmaker[AsyncSession]
) -> None:
    message = await make_message(sessions)
    conversation = await SqlDirectConversationRepository(sessions).get(
        message.conversation_id
    )
    assert conversation is not None
    recipient = conversation.other_participant(message.sender_id)
    await SqlDirectMessageRepository(sessions).add(message)
    broadcaster = PausedBroadcaster()
    name = f"tg65-block-{uuid.uuid4().hex}"
    block_engine = create_async_engine(
        DatabaseSettings().database_url,
        connect_args={"server_settings": {"application_name": name}},
    )
    block_sessions = async_sessionmaker(block_engine, expire_on_commit=False)
    dispatcher = DirectOutboxDispatcher(sessions, broadcaster)
    dispatch_task = asyncio.create_task(dispatcher.dispatch_once())
    block_task: asyncio.Task[None] | None = None
    try:
        await asyncio.wait_for(broadcaster.entered.wait(), 5)
        block_task = asyncio.create_task(
            SqlUserBlockRepository(block_sessions).block(
                UserBlock.create(recipient, message.sender_id)
            )
        )
        await wait_for_advisory_wait(engine, name)
        assert not block_task.done()
        assert broadcaster.delivered == []
        broadcaster.release.set()
        await asyncio.wait_for(dispatch_task, 5)
        await asyncio.wait_for(block_task, 5)
        assert broadcaster.delivered == [message.id]
        assert await SqlUserBlockRepository(sessions).is_blocked(
            recipient, message.sender_id
        )
        async with engine.connect() as conn:
            assert await pending(conn, message.id) == 0
    finally:
        broadcaster.release.set()
        for task in (dispatch_task, block_task):
            if task is not None and not task.done():
                task.cancel()
                await asyncio.gather(task, return_exceptions=True)
        await block_engine.dispose()
        async with engine.begin() as conn:
            await conn.execute(
                text("DELETE FROM direct_message_outbox WHERE message_id = :id"),
                {"id": message.id},
            )


async def test_tg65_dispatch_skips_locked_pair_then_respects_committed_block(
    engine: AsyncEngine, sessions: async_sessionmaker[AsyncSession]
) -> None:
    message = await make_message(sessions)
    conversation = await SqlDirectConversationRepository(sessions).get(
        message.conversation_id
    )
    assert conversation is not None
    recipient = conversation.other_participant(message.sender_id)
    await SqlDirectMessageRepository(sessions).add(message)
    broadcaster = PausedBroadcaster()
    broadcaster.release.set()
    dispatcher = DirectOutboxDispatcher(sessions, broadcaster)
    name = f"tg65-block-{uuid.uuid4().hex}"
    block_engine = create_async_engine(
        DatabaseSettings().database_url,
        connect_args={"server_settings": {"application_name": name}},
    )
    block_sessions = async_sessionmaker(block_engine, expire_on_commit=False)
    block_task: asyncio.Task[None] | None = None
    try:
        async with engine.connect() as lock_conn:
            transaction = await lock_conn.begin()
            try:
                key = ":".join(
                    str(value) for value in sorted((recipient, message.sender_id))
                )
                await lock_conn.execute(
                    text("SELECT pg_advisory_xact_lock(hashtextextended(:pair, 0))"),
                    {"pair": key},
                )
                block_task = asyncio.create_task(
                    SqlUserBlockRepository(block_sessions).block(
                        UserBlock.create(recipient, message.sender_id)
                    )
                )
                await wait_for_advisory_wait(engine, name)
                assert await asyncio.wait_for(dispatcher.dispatch_once(), 5) == 0
                assert broadcaster.delivered == []
            finally:
                await transaction.rollback()
        assert block_task is not None
        await asyncio.wait_for(block_task, 5)
        await asyncio.wait_for(dispatcher.dispatch_once(), 5)
        assert broadcaster.delivered == []
        assert await SqlUserBlockRepository(sessions).is_blocked(
            recipient, message.sender_id
        )
        async with engine.connect() as conn:
            assert await pending(conn, message.id) == 0
    finally:
        if block_task is not None and not block_task.done():
            block_task.cancel()
            await asyncio.gather(block_task, return_exceptions=True)
        await block_engine.dispose()
        async with engine.begin() as conn:
            await conn.execute(
                text("DELETE FROM direct_message_outbox WHERE message_id = :id"),
                {"id": message.id},
            )
