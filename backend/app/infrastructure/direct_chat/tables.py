import uuid
from datetime import datetime
from typing import ClassVar

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Table,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy import (
    text as sa_text,
)
from sqlmodel import Field, SQLModel


class DirectConversationRow(SQLModel, table=True):
    """Table ``direct_conversations`` (TG-65). The domain entity is
    ``DirectConversation``: one row per pair of users, stored ordered."""

    __tablename__ = "direct_conversations"
    __table__: ClassVar[Table]
    __table_args__ = (
        # The pair is ordered, so (a, b) and (b, a) are the same key; it also
        # rules out a conversation with oneself.
        CheckConstraint("user_a_id < user_b_id", name="pair_ordered"),
        # One conversation per pair; it also serves the lookup by (a, b).
        UniqueConstraint("user_a_id", "user_b_id", name="uq_direct_conversations_pair"),
        # The inbox looks up by the second user of the pair too.
        Index("ix_direct_conversations_user_b_id", "user_b_id"),
    )

    id: uuid.UUID = Field(
        sa_column=Column(Uuid(), primary_key=True, server_default=sa_text("uuidv7()"))
    )
    user_a_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid(), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        )
    )
    user_b_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid(), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        )
    )
    created_at: datetime = Field(
        sa_column=Column(
            DateTime(timezone=True), nullable=False, server_default=sa_text("now()")
        )
    )
    # Read marks live on the conversation row (two columns): messages of the
    # other participant sent after the mark are unread.
    user_a_read_at: datetime | None = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )
    user_b_read_at: datetime | None = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )


class DirectMessageRow(SQLModel, table=True):
    """Table ``direct_messages`` (TG-65). The domain entity is ``DirectMessage``."""

    __tablename__ = "direct_messages"
    __table__: ClassVar[Table]
    __table_args__ = (
        # Safety net on top of the domain; the maximum is enforced by the column
        # type (String(1000)).
        CheckConstraint("length(text) >= 1", name="text_not_empty"),
        # Idempotency (like TG-654): one key per sender; it also serves the lookup.
        UniqueConstraint("sender_id", "client_message_id"),
        # History by keyset: newest first inside a conversation (also serves the
        # conversation FK and the unread count).
        Index(
            "ix_direct_messages_conversation_id_sent_at_id",
            "conversation_id",
            sa_text("sent_at DESC"),
            sa_text("id DESC"),
        ),
    )

    id: uuid.UUID = Field(
        sa_column=Column(Uuid(), primary_key=True, server_default=sa_text("uuidv7()"))
    )
    conversation_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid(),
            ForeignKey("direct_conversations.id", ondelete="RESTRICT"),
            nullable=False,
            # Not indexed alone: the history index starts with it.
        )
    )
    sender_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid(), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        )
    )
    text: str = Field(sa_column=Column(String(1000), nullable=False))
    sent_at: datetime = Field(
        sa_column=Column(
            DateTime(timezone=True), nullable=False, server_default=sa_text("now()")
        )
    )
    client_message_id: uuid.UUID = Field(sa_column=Column(Uuid(), nullable=False))


class UserBlockRow(SQLModel, table=True):
    """Table ``user_blocks`` (TG-65). The domain value object is ``UserBlock``."""

    __tablename__ = "user_blocks"
    __table__: ClassVar[Table]
    __table_args__ = (CheckConstraint("blocker_id <> blocked_id", name="not_self"),)

    # The primary key (blocker_id, blocked_id) serves the lookups by blocker.
    blocker_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid(),
            ForeignKey("users.id", ondelete="RESTRICT"),
            primary_key=True,
        )
    )
    blocked_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid(),
            ForeignKey("users.id", ondelete="RESTRICT"),
            primary_key=True,
        )
    )
    created_at: datetime = Field(
        sa_column=Column(
            DateTime(timezone=True), nullable=False, server_default=sa_text("now()")
        )
    )


class DirectMessageOutboxRow(SQLModel, table=True):
    """Durable publication intent, one per message."""

    __tablename__ = "direct_message_outbox"
    __table__: ClassVar[Table]
    __table_args__ = (
        Index(
            "ix_direct_message_outbox_pending",
            "attempts",
            "message_id",
            postgresql_where=sa_text("delivered_at IS NULL"),
        ),
    )

    message_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid(),
            ForeignKey("direct_messages.id", ondelete="CASCADE"),
            primary_key=True,
        )
    )
    origin: str | None = Field(
        default=None, sa_column=Column(String(128), nullable=True)
    )
    delivered_at: datetime | None = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )
    attempts: int = Field(
        default=0,
        sa_column=Column(Integer, nullable=False, server_default=sa_text("0")),
    )
