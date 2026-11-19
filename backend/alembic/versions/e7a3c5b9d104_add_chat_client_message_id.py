"""Add chat_messages.client_message_id, the idempotency key of a send (TG-654)."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e7a3c5b9d104"
down_revision: str | None = "b3e9a6d2c581"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Nullable first so the existing messages can be given a key, then NOT NULL.
    op.add_column(
        "chat_messages", sa.Column("client_message_id", sa.Uuid(), nullable=True)
    )
    op.execute("UPDATE chat_messages SET client_message_id = gen_random_uuid()")
    op.alter_column("chat_messages", "client_message_id", nullable=False)
    # One key per author; it also serves the lookup by (author, key).
    op.create_unique_constraint(
        op.f("uq_chat_messages_author_id"),
        "chat_messages",
        ["author_id", "client_message_id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("uq_chat_messages_author_id"), "chat_messages", type_="unique"
    )
    op.drop_column("chat_messages", "client_message_id")
