"""Track failed delivery attempts to prevent outbox starvation."""

import sqlalchemy as sa

from alembic import op

revision = "a65d1ec70003"
down_revision = "a65d1ec70002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "direct_message_outbox",
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
    )
    op.drop_index(
        "ix_direct_message_outbox_pending", table_name="direct_message_outbox"
    )
    op.create_index(
        "ix_direct_message_outbox_pending",
        "direct_message_outbox",
        ["attempts", "message_id"],
        postgresql_where=sa.text("delivered_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index(
        "ix_direct_message_outbox_pending", table_name="direct_message_outbox"
    )
    op.create_index(
        "ix_direct_message_outbox_pending",
        "direct_message_outbox",
        ["message_id"],
        postgresql_where=sa.text("delivered_at IS NULL"),
    )
    op.drop_column("direct_message_outbox", "attempts")
