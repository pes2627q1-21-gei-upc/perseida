import uuid
from collections.abc import Collection
from datetime import UTC, datetime, timedelta

from sqlalchemy import case, delete, exists, func, or_, select, text, true, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlmodel import col, tuple_

from app.application.shared.errors import ForbiddenError
from app.domain.direct_chat.errors import (
    CONVERSATION_NOT_FOUND,
    USER_BLOCKED,
    VALIDATION_ERROR,
)
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
    DirectMessageOutboxRow,
    DirectMessageRow,
    UserBlockRow,
)
from app.infrastructure.persistence.errors import database_errors
from app.infrastructure.users.tables import UserRow


async def lock_pair(session: AsyncSession, a: uuid.UUID, b: uuid.UUID) -> None:
    """Serialize block changes with dispatch across all application instances."""
    key = ":".join(str(value) for value in sorted((a, b)))
    await session.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:pair, 0))"),
        {"pair": key},
    )


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

    async def mark_read_through(
        self, conversation_id: uuid.UUID, user_id: uuid.UUID, message_id: uuid.UUID
    ) -> DirectConversation:
        message_time = (
            select(col(DirectMessageRow.sent_at))
            .where(
                col(DirectMessageRow.id) == message_id,
                col(DirectMessageRow.conversation_id) == conversation_id,
            )
            .scalar_subquery()
        )
        a = col(DirectConversationRow.user_a_id) == user_id
        b = col(DirectConversationRow.user_b_id) == user_id
        statement = (
            update(DirectConversationRow)
            .where(
                col(DirectConversationRow.id) == conversation_id,
                or_(a, b),
                message_time.is_not(None),
            )
            .values(
                user_a_read_at=case(
                    (
                        a,
                        func.greatest(
                            col(DirectConversationRow.user_a_read_at), message_time
                        ),
                    ),
                    else_=col(DirectConversationRow.user_a_read_at),
                ),
                user_b_read_at=case(
                    (
                        b,
                        func.greatest(
                            col(DirectConversationRow.user_b_read_at), message_time
                        ),
                    ),
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
                CONVERSATION_NOT_FOUND, "The conversation or message does not exist"
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
            select(
                DirectConversationRow,
                last,
                unread.label("unread"),
                col(UserRow.display_name).label("other_display_name"),
                col(UserRow.avatar_url).label("other_avatar_url"),
            )
            .select_from(DirectConversationRow)
            .outerjoin_from(DirectConversationRow, last, true())
            .join_from(
                DirectConversationRow,
                UserRow,
                col(UserRow.id)
                == case(
                    (
                        col(DirectConversationRow.user_a_id) == user_id,
                        col(DirectConversationRow.user_b_id),
                    ),
                    else_=col(DirectConversationRow.user_a_id),
                ),
            )
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
                other_display_name=row.other_display_name,
                other_avatar_url=row.other_avatar_url,
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

    async def add(
        self, message: DirectMessage, *, origin: str | None = None
    ) -> DirectMessage:
        find = select(DirectMessageRow).where(
            col(DirectMessageRow.sender_id) == message.sender_id,
            col(DirectMessageRow.client_message_id) == message.client_message_id,
        )
        with database_errors():
            async with self._session_factory() as session:
                conversation = await session.get_one(
                    DirectConversationRow, message.conversation_id
                )
                await lock_pair(session, conversation.user_a_id, conversation.user_b_id)
                blocked = await session.scalar(
                    select(
                        exists().where(
                            or_(
                                (col(UserBlockRow.blocker_id) == conversation.user_a_id)
                                & (
                                    col(UserBlockRow.blocked_id)
                                    == conversation.user_b_id
                                ),
                                (col(UserBlockRow.blocker_id) == conversation.user_b_id)
                                & (
                                    col(UserBlockRow.blocked_id)
                                    == conversation.user_a_id
                                ),
                            )
                        )
                    )
                )
                if blocked:
                    raise ForbiddenError(USER_BLOCKED, "The conversation is blocked")
                latest = await session.scalar(
                    select(col(DirectMessageRow.sent_at))
                    .where(
                        col(DirectMessageRow.conversation_id) == message.conversation_id
                    )
                    .order_by(col(DirectMessageRow.sent_at).desc())
                    .limit(1)
                )
                if latest is not None and message.sent_at <= latest:
                    message = message.model_copy(
                        update={"sent_at": latest + timedelta(microseconds=1)}
                    )
                statement = (
                    insert(DirectMessageRow)
                    .values(**message.model_dump())
                    .on_conflict_do_nothing(
                        index_elements=["sender_id", "client_message_id"]
                    )
                    .returning(DirectMessageRow)
                )
                row = await session.scalar(statement)
                if row is None:
                    row = (await session.scalars(find)).one()
                else:
                    session.add(
                        DirectMessageOutboxRow(message_id=row.id, origin=origin)
                    )
                await session.commit()
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
                await lock_pair(session, user_block.blocker_id, user_block.blocked_id)
                await session.execute(statement)
                pair_conversation = select(col(DirectConversationRow.id)).where(
                    col(DirectConversationRow.user_a_id)
                    == min(user_block.blocker_id, user_block.blocked_id),
                    col(DirectConversationRow.user_b_id)
                    == max(user_block.blocker_id, user_block.blocked_id),
                )
                pair_messages = select(col(DirectMessageRow.id)).where(
                    col(DirectMessageRow.conversation_id).in_(pair_conversation)
                )
                await session.execute(
                    update(DirectMessageOutboxRow)
                    .where(
                        col(DirectMessageOutboxRow.message_id).in_(pair_messages),
                        col(DirectMessageOutboxRow.delivered_at).is_(None),
                    )
                    .values(delivered_at=datetime.now(UTC))
                )
                await session.commit()

    async def unblock(self, blocker_id: uuid.UUID, blocked_id: uuid.UUID) -> None:
        statement = delete(UserBlockRow).where(
            col(UserBlockRow.blocker_id) == blocker_id,
            col(UserBlockRow.blocked_id) == blocked_id,
        )
        with database_errors():
            async with self._session_factory() as session:
                await lock_pair(session, blocker_id, blocked_id)
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
