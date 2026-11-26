"""Add a durable outbox for direct messages (TG-65)."""

import sqlalchemy as sa

from alembic import op

revision = "a65d1ec70002"
down_revision = "a65d1ec70001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "direct_message_outbox",
        sa.Column("message_id", sa.Uuid(), nullable=False),
        sa.Column("origin", sa.String(128), nullable=True),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["message_id"], ["direct_messages.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("message_id"),
    )
    op.create_index(
        "ix_direct_message_outbox_pending",
        "direct_message_outbox",
        ["message_id"],
        postgresql_where=sa.text("delivered_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index(
        "ix_direct_message_outbox_pending", table_name="direct_message_outbox"
    )
    op.drop_table("direct_message_outbox")
