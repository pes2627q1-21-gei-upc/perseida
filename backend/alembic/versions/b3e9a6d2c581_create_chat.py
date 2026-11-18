"""Create the chat tables: event_chat_rooms and chat_messages (TG-450)."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b3e9a6d2c581"
down_revision: str | None = "d1b7e4c9a2f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "event_chat_rooms",
        sa.Column("id", sa.Uuid(), server_default=sa.text("uuidv7()"), nullable=False),
        sa.Column("event_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["event_id"],
            ["astronomical_events.id"],
            name=op.f("fk_event_chat_rooms_event_id_astronomical_events"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_event_chat_rooms")),
        # At most one room per event; it also serves the lookups by event.
        sa.UniqueConstraint("event_id", name=op.f("uq_event_chat_rooms_event_id")),
    )
    op.create_table(
        "chat_messages",
        sa.Column("id", sa.Uuid(), server_default=sa.text("uuidv7()"), nullable=False),
        sa.Column("room_id", sa.Uuid(), nullable=False),
        sa.Column("author_id", sa.Uuid(), nullable=False),
        sa.Column("text", sa.String(length=1000), nullable=False),
        # No server_default: the domain sets it and the cursor order depends on it.
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=False),
        # Safety net on top of the domain; the maximum is enforced by the column
        # type (String(1000)).
        sa.CheckConstraint(
            "length(text) >= 1", name=op.f("ck_chat_messages_text_length")
        ),
        sa.ForeignKeyConstraint(
            ["room_id"],
            ["event_chat_rooms.id"],
            name=op.f("fk_chat_messages_room_id_event_chat_rooms"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["author_id"],
            ["users.id"],
            name=op.f("fk_chat_messages_author_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_chat_messages")),
    )
    # History by keyset: newest first inside a room (also serves the room FK).
    op.create_index(
        "ix_chat_messages_room_id_sent_at_id",
        "chat_messages",
        ["room_id", sa.text("sent_at DESC"), sa.text("id DESC")],
    )
    # The cascade on deleting a user looks up by author.
    op.create_index(op.f("ix_chat_messages_author_id"), "chat_messages", ["author_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_chat_messages_author_id"), table_name="chat_messages")
    op.drop_index("ix_chat_messages_room_id_sent_at_id", table_name="chat_messages")
    op.drop_table("chat_messages")
    op.drop_table("event_chat_rooms")
