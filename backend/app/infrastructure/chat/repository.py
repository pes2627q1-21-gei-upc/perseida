import uuid
from sqlalchemy import Select, exists, select, true
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlmodel import col, tuple_

from app.application.chat.errors import CHAT_ROOM_NOT_FOUND
from app.domain.chat.models import (
    ChatAuthor,
    ChatCursor,
    ChatMessage,
    ChatRepositoryPage,
    ChatRoomSummary,
    EventChatRoom,
)
from app.domain.events.errors import EVENT_NOT_FOUND
from app.domain.shared.errors import NotFoundError
from app.infrastructure.chat.tables import ChatMessageRow, EventChatRoomRow
from app.infrastructure.events.tables import (
    AstronomicalEventRow,
    EventSubscriptionRow,
)
from app.infrastructure.persistence.errors import database_errors
from app.infrastructure.users.tables import UserRow

_ROOM_FOREIGN_KEY = "fk_chat_messages_room_id_event_chat_rooms"


def _room(row: EventChatRoomRow) -> EventChatRoom:
    return EventChatRoom(id=row.id, event_id=row.event_id, created_at=row.created_at)


def _message(row: ChatMessageRow, author_name: str | None) -> ChatMessage:
    return ChatMessage(
        id=row.id,
        room_id=row.room_id,
        author=ChatAuthor(id=row.author_id, name=author_name),
        text=row.text,
        sent_at=row.sent_at,
        client_message_id=row.client_message_id,
    )


def _with_author_name() -> Select[ChatMessageRow, str | None]:
    """Messages joined with the profile name of their author (one query)."""
    return select(ChatMessageRow, col(UserRow.display_name)).join(
        UserRow, col(UserRow.id) == col(ChatMessageRow.author_id)
    )


def _event_not_found(event_id: uuid.UUID) -> NotFoundError:
    return NotFoundError(EVENT_NOT_FOUND, f"Event {event_id} does not exist")


class SqlChatRepository:
    """Chat rooms and messages stored in PostgreSQL (TG-450). Each call uses its
    own session."""

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def _event_exists(self, session: AsyncSession, event_id: uuid.UUID) -> bool:
        statement = select(exists().where(col(AstronomicalEventRow.id) == event_id))
        return bool(await session.scalar(statement))

    async def require_event(self, event_id: uuid.UUID) -> None:
        with database_errors():
            async with self._session_factory() as session:
                if not await self._event_exists(session, event_id):
                    raise _event_not_found(event_id)

    async def get_or_create_room(self, event_id: uuid.UUID) -> EventChatRoom:
        new_room = EventChatRoom.create(event_id=event_id)
        # ON CONFLICT keeps the stored room, also when several requests insert
        # at once: only one of them gets a row back, the others read it.
        insert_room = (
            insert(EventChatRoomRow)
            .values(
                id=new_room.id,
                event_id=new_room.event_id,
                created_at=new_room.created_at,
            )
            .on_conflict_do_nothing(index_elements=["event_id"])
            .returning(EventChatRoomRow)
        )
        find_room = select(EventChatRoomRow).where(
            col(EventChatRoomRow.event_id) == event_id
        )
        with database_errors():
            async with self._session_factory() as session:
                if not await self._event_exists(session, event_id):
                    raise _event_not_found(event_id)
                try:
                    created = await session.scalar(insert_room)
                    await session.commit()
                except IntegrityError:
                    # The event was deleted between the check and the insert.
                    await session.rollback()
                    raise _event_not_found(event_id) from None
                if created is not None:
                    return _room(created)
                return _room((await session.scalars(find_room)).one())

    async def find_by_client_id(
        self, author_id: uuid.UUID, client_message_id: uuid.UUID
    ) -> ChatMessage | None:
        # Served by the unique (author_id, client_message_id).
        statement = _with_author_name().where(
            col(ChatMessageRow.author_id) == author_id,
            col(ChatMessageRow.client_message_id) == client_message_id,
        )
        with database_errors():
            async with self._session_factory() as session:
                record = (await session.execute(statement)).one_or_none()
        return None if record is None else _message(record[0], record[1])

    async def add_message(self, message: ChatMessage) -> ChatMessage:
        # The conflict target is explicit: only a repeated idempotency key is
        # swallowed; a repeated id still fails on the primary key.
        statement = (
            insert(ChatMessageRow)
            .values(
                id=message.id,
                room_id=message.room_id,
                author_id=message.author.id,
                text=message.text,
                sent_at=message.sent_at,
                client_message_id=message.client_message_id,
            )
            .on_conflict_do_nothing(index_elements=["author_id", "client_message_id"])
            .returning(ChatMessageRow)
        )
        find_stored = _with_author_name().where(
            col(ChatMessageRow.author_id) == message.author.id,
            col(ChatMessageRow.client_message_id) == message.client_message_id,
        )
        with database_errors():
            try:
                async with self._session_factory() as session:
                    inserted = await session.scalar(statement)
                    await session.commit()
                    if inserted is not None:
                        # This call stored it: the caller already has the name.
                        return _message(inserted, message.author.name)
                    # Conflict: a concurrent retry or an idempotent resend stored
                    # it first; that row is the result, with its profile name.
                    stored = (await session.execute(find_stored)).one()
                    return _message(stored[0], stored[1])
            except IntegrityError as exc:
                # Only the room foreign key means "room not found"; a repeated id,
                # the text CHECK or a missing author are other failures.
                if _ROOM_FOREIGN_KEY not in str(exc.orig):
                    raise
                raise NotFoundError(
                    CHAT_ROOM_NOT_FOUND, f"Room {message.room_id} does not exist"
                ) from None

    async def page(
        self, room_id: uuid.UUID, before: ChatCursor | None, limit: int
    ) -> ChatRepositoryPage:
        if limit < 1:
            raise ValueError("limit must be >= 1")
        # The index (room_id, sent_at DESC, id DESC) serves filter and order.
        statement = select(ChatMessageRow).where(col(ChatMessageRow.room_id) == room_id)
        if before is not None:
            statement = statement.where(
                tuple_(col(ChatMessageRow.sent_at), col(ChatMessageRow.id))
                < tuple_(before.sent_at, before.id)
            )
        statement = statement.order_by(
            col(ChatMessageRow.sent_at).desc(), col(ChatMessageRow.id).desc()
        ).limit(limit + 1)
        with database_errors():
            async with self._session_factory() as session:
                rows = list((await session.scalars(statement)).all())
                names: dict[uuid.UUID, str | None] = {}
                if rows:
                    # One more query by primary key for the (at most ``limit``)
                    # distinct authors of the page: never one query per message.
                    names_statement = select(
                        col(UserRow.id), col(UserRow.display_name)
                    ).where(
                        col(UserRow.id).in_({row.author_id for row in rows[:limit]})
                    )
                    names = dict(
                        (await session.execute(names_statement)).tuples().all()
                    )
        messages = [_message(row, names.get(row.author_id)) for row in rows[:limit]]
        next_cursor = (
            ChatCursor(sent_at=messages[-1].sent_at, id=messages[-1].id)
            if len(rows) > limit
            else None
        )
        return ChatRepositoryPage(messages=messages, next_cursor=next_cursor)

    async def list_rooms_of(self, user_id: uuid.UUID) -> list[ChatRoomSummary]:
        # One query: the subscriptions of the user, their rooms and, per room,
        # its latest message through a LATERAL that reads the history index.
        last = (
            select(ChatMessageRow)
            .where(col(ChatMessageRow.room_id) == col(EventChatRoomRow.id))
            .order_by(col(ChatMessageRow.sent_at).desc(), col(ChatMessageRow.id).desc())
            .limit(1)
            .lateral("last_message")
        )
        statement = (
            select(
                col(EventChatRoomRow.id).label("room_id"),
                col(EventChatRoomRow.event_id).label("event_id"),
                col(EventChatRoomRow.created_at).label("room_created_at"),
                last.c.id.label("message_id"),
                last.c.author_id.label("author_id"),
                col(UserRow.display_name).label("author_name"),
                last.c.text.label("text"),
                last.c.sent_at.label("sent_at"),
                last.c.client_message_id.label("client_message_id"),
            )
            .join(
                EventSubscriptionRow,
                col(EventSubscriptionRow.event_id) == col(EventChatRoomRow.event_id),
            )
            .outerjoin(last, true())
            .outerjoin(UserRow, col(UserRow.id) == last.c.author_id)
            .where(col(EventSubscriptionRow.user_id) == user_id)
            .order_by(
                last.c.sent_at.desc().nulls_last(),
                col(EventChatRoomRow.created_at).desc(),
                col(EventChatRoomRow.id).desc(),
            )
        )
        with database_errors():
            async with self._session_factory() as session:
                rows = (await session.execute(statement)).all()
        return [
            ChatRoomSummary(
                room=EventChatRoom(
                    id=row.room_id,
                    event_id=row.event_id,
                    created_at=row.room_created_at,
                ),
                last_message=(
                    None
                    if row.message_id is None
                    else ChatMessage(
                        id=row.message_id,
                        room_id=row.room_id,
                        author=ChatAuthor(id=row.author_id, name=row.author_name),
                        text=row.text,
                        sent_at=row.sent_at,
                        client_message_id=row.client_message_id,
                    )
                ),
            )
            for row in rows
        ]
