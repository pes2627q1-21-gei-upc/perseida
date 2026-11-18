import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    String,
    Uuid,
)
from sqlalchemy import (
    text as sa_text,
)
from sqlmodel import Field, SQLModel


class PostRow(SQLModel, table=True):
    """Table ``posts``. Persistence model for community event posts."""

    __tablename__ = "posts"
    __table_args__ = (
        CheckConstraint(
            "length(text) >= 1 AND length(text) <= 1000",
            name="post_text_length",
        ),
        Index(
            "ix_posts_event_id_created_at_id",
            "event_id",
            sa_text("created_at DESC"),
            sa_text("id DESC"),
        ),
    )

    id: uuid.UUID = Field(
        sa_column=Column(Uuid(), primary_key=True, server_default=sa_text("uuidv7()"))
    )
    event_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid(),
            ForeignKey("astronomical_events.id", ondelete="CASCADE"),
            nullable=False,
            # Not indexed alone: ix_posts_event_id_created_at_id starts with it.
        )
    )
    user_id: uuid.UUID = Field(
        sa_column=Column(
            Uuid(),
            ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    text: str = Field(sa_column=Column(String(1000), nullable=False))
    created_at: datetime = Field(
        sa_column=Column(
            DateTime(timezone=True), nullable=False, server_default=sa_text("now()")
        )
    )
    edited_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
