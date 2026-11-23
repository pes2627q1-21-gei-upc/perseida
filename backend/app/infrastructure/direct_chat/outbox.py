"""Transactional, at-least-once direct-message delivery."""

import asyncio
import logging
import uuid
from datetime import UTC, datetime

from sqlalchemy import exists, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlmodel import col, tuple_

from app.domain.direct_chat.models import DirectMessage
from app.domain.direct_chat.ports import DirectMessageBroadcaster, PushNotifier
from app.infrastructure.direct_chat.tables import (
    DirectConversationRow,
    DirectMessageOutboxRow,
    DirectMessageRow,
    UserBlockRow,
)

logger = logging.getLogger(__name__)
POLL_SECONDS = 1.0
BATCH_SIZE = 100


class DirectOutboxDispatcher:
    def __init__(
        self,
        factory: async_sessionmaker[AsyncSession],
        broadcaster: DirectMessageBroadcaster,
        push: PushNotifier | None = None,
    ) -> None:
        self._factory = factory
        self._broadcaster = broadcaster
        self._push = push
        self._cursor: tuple[int, uuid.UUID] | None = None
        self._dispatch_lock = asyncio.Lock()

    async def run(self) -> None:
        """Drain available work, then wait if no item made progress."""
        while True:
            try:
                progressed = await self.dispatch_once()
            except Exception:
                logger.exception("Direct message outbox worker failed")
                progressed = 0
            if not progressed:
                await asyncio.sleep(POLL_SECONDS)

    async def dispatch_once(self) -> int:
        """Scan a batch, advancing past busy pairs even when their lock is held."""
        # A dispatcher is normally driven by one loop, but callers may trigger a
        # concurrent drain; keep this instance's scan cursor consistent.
        async with self._dispatch_lock:
            return await self._dispatch_batch()

    async def _dispatch_batch(self) -> int:
        async with self._factory() as session:
            statement = (
                select(
                    col(DirectMessageOutboxRow.message_id),
                    col(DirectMessageOutboxRow.attempts),
                    col(DirectConversationRow.user_a_id),
                    col(DirectConversationRow.user_b_id),
                )
                .join(
                    DirectMessageRow,
                    col(DirectMessageRow.id) == col(DirectMessageOutboxRow.message_id),
                )
                .join(
                    DirectConversationRow,
                    col(DirectConversationRow.id)
                    == col(DirectMessageRow.conversation_id),
                )
                .where(col(DirectMessageOutboxRow.delivered_at).is_(None))
                .order_by(
                    col(DirectMessageOutboxRow.attempts),
                    col(DirectMessageOutboxRow.message_id),
                )
                .limit(BATCH_SIZE)
            )
            if self._cursor is not None:
                statement = statement.where(
                    tuple_(
                        col(DirectMessageOutboxRow.attempts),
                        col(DirectMessageOutboxRow.message_id),
                    )
                    > tuple_(*self._cursor)
                )
            candidates = (await session.execute(statement)).all()
        if not candidates:
            # Wrap to revisit rows skipped for locks or newly inserted before
            # the cursor. Each dispatcher maintains an independent scan.
            self._cursor = None
            return 0
        progressed = 0
        for message_id, attempts, a, b in candidates:
            # Advance even if a pair is busy or processing throws: otherwise
            # an entire batch of locked pairs can starve everything after it.
            self._cursor = (attempts, message_id)
            try:
                progressed += int(await self._dispatch_one(message_id, a, b))
            except Exception:
                logger.exception("Could not process a direct message outbox item")
        return progressed

    async def _dispatch_one(
        self, message_id: uuid.UUID, a: uuid.UUID, b: uuid.UUID
    ) -> bool:
        notification: tuple[uuid.UUID, DirectMessage] | None = None
        async with self._factory() as session, session.begin():
            # Block, unblock, insert and dispatch always acquire pair before row.
            key = ":".join(str(value) for value in sorted((a, b)))
            acquired = await session.scalar(
                text("SELECT pg_try_advisory_xact_lock(hashtextextended(:pair, 0))"),
                {"pair": key},
            )
            if not acquired:
                return False
            entry = await session.get(
                DirectMessageOutboxRow, message_id, with_for_update=True
            )
            if entry is None or entry.delivered_at is not None:
                return False
            row = await session.get_one(DirectMessageRow, message_id)
            blocked = await session.scalar(
                select(
                    exists().where(
                        or_(
                            (col(UserBlockRow.blocker_id) == a)
                            & (col(UserBlockRow.blocked_id) == b),
                            (col(UserBlockRow.blocker_id) == b)
                            & (col(UserBlockRow.blocked_id) == a),
                        )
                    )
                )
            )
            if not blocked:
                try:
                    message = DirectMessage.model_validate(row, from_attributes=True)
                    recipient = b if row.sender_id == a else a
                    receivers = await self._broadcaster.deliver(
                        message, recipient_id=recipient, origin=entry.origin
                    )
                    if receivers == 0 and self._push is not None:
                        notification = (recipient, message)
                except Exception:
                    entry.attempts += 1
                    logger.warning(
                        "Direct message outbox delivery failed; will retry",
                        exc_info=True,
                    )
                    return False
            entry.delivered_at = datetime.now(UTC)
        if notification is not None and self._push is not None:
            try:
                await self._push.notify(*notification)
            except Exception:
                logger.warning("Direct message push failed", exc_info=True)
        return True
