import uuid
from datetime import datetime
from typing import ClassVar

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    String,
    Table,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy import (
    text as sa_text,
)
from sqlmodel import Field, SQLModel


class EventChatRoomRow(SQLModel, table=True):
    """Table ``event_chat_rooms`` (TG-450). The domain entity is
    ``EventChatRoom``; deleting the event deletes it."""

    __tablename__ = "event_chat_rooms"
    __table__: ClassVar[Table]
    # At most one room per event; it also serves the lookups by event.
    __table_args__ = (UniqueConstraint("event_id"),)

    id: uuid.UUID = Field(
        sa_column=Column(Uuid(), primary_key=True, server_default=sa_text("uuidv7()"))
    )
    event_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid(),
            ForeignKey("astronomical_events.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    created_at: datetime = Field(
        sa_column=Column(
            DateTime(timezone=True), nullable=False, server_default=sa_text("now()")
        )
    )


class ChatMessageRow(SQLModel, table=True):
    """Table ``chat_messages`` (TG-450). The domain entity is ``ChatMessage``."""

    __tablename__ = "chat_messages"
    __table__: ClassVar[Table]
    __table_args__ = (
        # Safety net on top of the domain; the maximum is enforced by the column
        # type (String(1000)).
        CheckConstraint("length(text) >= 1", name="text_length"),
        # History by keyset: newest first inside a room (also serves the room FK).
        Index(
            "ix_chat_messages_room_id_sent_at_id",
            "room_id",
            sa_text("sent_at DESC"),
            sa_text("id DESC"),
        ),
    )

    id: uuid.UUID = Field(
        sa_column=Column(Uuid(), primary_key=True, server_default=sa_text("uuidv7()"))
    )
    room_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid(),
            ForeignKey("event_chat_rooms.id", ondelete="CASCADE"),
            nullable=False,
            # Not indexed alone: the history index starts with it.
        )
    )
    # Index: the cascade on deleting a user looks up by ``author_id``.
    author_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid(),
            ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    text: str = Field(sa_column=Column(String(1000), nullable=False))
    # No server_default: the domain sets it and the cursor order depends on it.
    sent_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
