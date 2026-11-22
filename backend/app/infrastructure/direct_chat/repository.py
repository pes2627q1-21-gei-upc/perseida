import uuid
from collections.abc import Collection
from datetime import datetime

from sqlalchemy import case, delete, exists, func, or_, select, true, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlmodel import col, tuple_

from app.domain.direct_chat.errors import CONVERSATION_NOT_FOUND, VALIDATION_ERROR
from app.domain.direct_chat.models import (
    ConversationSummary,
    DirectConversation,
    DirectCursor,
    DirectMessage,
    DirectMessagePage,
    UserBlock,
)
from app.domain.shared.errors import NotFoundError, ValidationError
from app.infrastructure.direct_chat.tables import (
    DirectConversationRow,
    DirectMessageRow,
    UserBlockRow,
)
from app.infrastructure.persistence.errors import database_errors


def _conversation(row: DirectConversationRow) -> DirectConversation:
    return DirectConversation.model_validate(row, from_attributes=True)


def _message(row: DirectMessageRow) -> DirectMessage:
    return DirectMessage.model_validate(row, from_attributes=True)


def _aware(value: datetime | None) -> None:
    if value is not None and (value.tzinfo is None or value.utcoffset() is None):
        raise ValidationError(VALIDATION_ERROR, "The time must have a time zone")


class SqlDirectConversationRepository:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def get_or_create(
        self, user_a_id: uuid.UUID, user_b_id: uuid.UUID
    ) -> tuple[DirectConversation, bool]:
        new = DirectConversation.create(user_a_id, user_b_id)
        statement = (
            insert(DirectConversationRow)
            .values(**new.model_dump())
            .on_conflict_do_nothing(index_elements=["user_a_id", "user_b_id"])
            .returning(DirectConversationRow)
        )
        find = select(DirectConversationRow).where(
            col(DirectConversationRow.user_a_id) == new.user_a_id,
            col(DirectConversationRow.user_b_id) == new.user_b_id,
        )
        with database_errors():
            async with self._session_factory() as session:
                row = await session.scalar(statement)
                await session.commit()
                if row is not None:
                    return _conversation(row), True
                return _conversation((await session.scalars(find)).one()), False

    async def get(self, conversation_id: uuid.UUID) -> DirectConversation | None:
        with database_errors():
            async with self._session_factory() as session:
                row = await session.get(DirectConversationRow, conversation_id)
        return None if row is None else _conversation(row)

    async def mark_read(
        self, conversation_id: uuid.UUID, user_id: uuid.UUID, at: datetime
    ) -> DirectConversation:
        _aware(at)
        # Atomic update prevents concurrent requests from moving a mark backwards.
        a = col(DirectConversationRow.user_a_id) == user_id
        b = col(DirectConversationRow.user_b_id) == user_id
        statement = (
            update(DirectConversationRow)
            .where(col(DirectConversationRow.id) == conversation_id, or_(a, b))
            .values(
                user_a_read_at=case(
                    (a, func.greatest(col(DirectConversationRow.user_a_read_at), at)),
                    else_=col(DirectConversationRow.user_a_read_at),
                ),
                user_b_read_at=case(
                    (b, func.greatest(col(DirectConversationRow.user_b_read_at), at)),
                    else_=col(DirectConversationRow.user_b_read_at),
                ),
            )
            .returning(DirectConversationRow)
        )
        with database_errors():
            async with self._session_factory() as session:
                row = await session.scalar(statement)
                await session.commit()
        if row is None:
            raise NotFoundError(
                CONVERSATION_NOT_FOUND, "The conversation does not exist"
            )
        return _conversation(row)

    async def list_of(self, user_id: uuid.UUID) -> list[DirectConversation]:
        statement = select(DirectConversationRow).where(
            or_(
                col(DirectConversationRow.user_a_id) == user_id,
                col(DirectConversationRow.user_b_id) == user_id,
            )
        )
        with database_errors():
            async with self._session_factory() as session:
                rows = (await session.scalars(statement)).all()
        return [_conversation(row) for row in rows]

    async def summaries_of(self, user_id: uuid.UUID) -> list[ConversationSummary]:
        last = (
            select(DirectMessageRow)
            .where(
                col(DirectMessageRow.conversation_id) == col(DirectConversationRow.id)
            )
            .order_by(
                col(DirectMessageRow.sent_at).desc(), col(DirectMessageRow.id).desc()
            )
            .limit(1)
            .lateral("last_message")
        )
        mark = case(
            (
                col(DirectConversationRow.user_a_id) == user_id,
                col(DirectConversationRow.user_a_read_at),
            ),
            else_=col(DirectConversationRow.user_b_read_at),
        )
        unread = (
            select(func.count())
            .select_from(DirectMessageRow)
            .where(
                col(DirectMessageRow.conversation_id) == col(DirectConversationRow.id),
                col(DirectMessageRow.sender_id) != user_id,
                or_(mark.is_(None), col(DirectMessageRow.sent_at) > mark),
            )
            .correlate(DirectConversationRow)
            .scalar_subquery()
        )
        statement = (
            select(DirectConversationRow, last, unread.label("unread"))
            .outerjoin(last, true())
            .where(
                or_(
                    col(DirectConversationRow.user_a_id) == user_id,
                    col(DirectConversationRow.user_b_id) == user_id,
                )
            )
            .order_by(
                func.coalesce(
                    last.c.sent_at, col(DirectConversationRow.created_at)
                ).desc(),
                col(DirectConversationRow.id).desc(),
            )
        )
        with database_errors():
            async with self._session_factory() as session:
                rows = (await session.execute(statement)).all()
        return [
            ConversationSummary(
                conversation=_conversation(row[0]),
                last_message=None
                if row.id is None
                else DirectMessage(
                    id=row.id,
                    conversation_id=row.conversation_id,
                    sender_id=row.sender_id,
                    text=row.text,
                    sent_at=row.sent_at,
                    client_message_id=row.client_message_id,
                ),
                unread_count=row.unread,
            )
            for row in rows
        ]


class SqlDirectMessageRepository:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def find_by_client_id(
        self, sender_id: uuid.UUID, client_message_id: uuid.UUID
    ) -> DirectMessage | None:
        statement = select(DirectMessageRow).where(
            col(DirectMessageRow.sender_id) == sender_id,
            col(DirectMessageRow.client_message_id) == client_message_id,
        )
        with database_errors():
            async with self._session_factory() as session:
                row = await session.scalar(statement)
        return None if row is None else _message(row)

    async def add(self, message: DirectMessage) -> DirectMessage:
        statement = (
            insert(DirectMessageRow)
            .values(**message.model_dump())
            .on_conflict_do_nothing(index_elements=["sender_id", "client_message_id"])
            .returning(DirectMessageRow)
        )
        find = select(DirectMessageRow).where(
            col(DirectMessageRow.sender_id) == message.sender_id,
            col(DirectMessageRow.client_message_id) == message.client_message_id,
        )
        with database_errors():
            async with self._session_factory() as session:
                row = await session.scalar(statement)
                await session.commit()
                if row is None:
                    row = (await session.scalars(find)).one()
        return _message(row)

    async def page(
        self, conversation_id: uuid.UUID, before: DirectCursor | None, limit: int
    ) -> DirectMessagePage:
        if limit < 1:
            raise ValueError("limit must be >= 1")
        statement = select(DirectMessageRow).where(
            col(DirectMessageRow.conversation_id) == conversation_id
        )
        if before is not None:
            statement = statement.where(
                tuple_(col(DirectMessageRow.sent_at), col(DirectMessageRow.id))
                < tuple_(before.sent_at, before.id)
            )
        statement = statement.order_by(
            col(DirectMessageRow.sent_at).desc(), col(DirectMessageRow.id).desc()
        ).limit(limit + 1)
        with database_errors():
            async with self._session_factory() as session:
                rows = list((await session.scalars(statement)).all())
        messages = [_message(row) for row in rows[:limit]]
        cursor = (
            DirectCursor(sent_at=messages[-1].sent_at, id=messages[-1].id)
            if len(rows) > limit
            else None
        )
        return DirectMessagePage(messages=messages, next_cursor=cursor)

    async def count_unread(
        self, conversation_id: uuid.UUID, user_id: uuid.UUID, since: datetime | None
    ) -> int:
        _aware(since)
        statement = (
            select(func.count())
            .select_from(DirectMessageRow)
            .where(
                col(DirectMessageRow.conversation_id) == conversation_id,
                col(DirectMessageRow.sender_id) != user_id,
            )
        )
        if since is not None:
            statement = statement.where(col(DirectMessageRow.sent_at) > since)
        with database_errors():
            async with self._session_factory() as session:
                return int(await session.scalar(statement) or 0)


class SqlUserBlockRepository:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def block(self, user_block: UserBlock) -> None:
        statement = (
            insert(UserBlockRow)
            .values(**user_block.model_dump())
            .on_conflict_do_nothing(index_elements=["blocker_id", "blocked_id"])
        )
        with database_errors():
            async with self._session_factory() as session:
                await session.execute(statement)
                await session.commit()

    async def unblock(self, blocker_id: uuid.UUID, blocked_id: uuid.UUID) -> None:
        statement = delete(UserBlockRow).where(
            col(UserBlockRow.blocker_id) == blocker_id,
            col(UserBlockRow.blocked_id) == blocked_id,
        )
        with database_errors():
            async with self._session_factory() as session:
                await session.execute(statement)
                await session.commit()

    async def is_blocked(self, blocker_id: uuid.UUID, blocked_id: uuid.UUID) -> bool:
        statement = select(
            exists().where(
                col(UserBlockRow.blocker_id) == blocker_id,
                col(UserBlockRow.blocked_id) == blocked_id,
            )
        )
        with database_errors():
            async with self._session_factory() as session:
                return bool(await session.scalar(statement))

    async def blocked_among(
        self, blocker_id: uuid.UUID, user_ids: Collection[uuid.UUID]
    ) -> set[uuid.UUID]:
        if not user_ids:
            return set()
        statement = select(col(UserBlockRow.blocked_id)).where(
            col(UserBlockRow.blocker_id) == blocker_id,
            col(UserBlockRow.blocked_id).in_(user_ids),
        )
        with database_errors():
            async with self._session_factory() as session:
                return set((await session.scalars(statement)).all())
