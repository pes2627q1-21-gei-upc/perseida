"""Create the event_subscriptions table (TG-53)."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d1b7e4c9a2f6"
down_revision: str | None = "d5f8e2a3b104"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "event_subscriptions",
        sa.Column("id", sa.Uuid(), server_default=sa.text("uuidv7()"), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("event_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_event_subscriptions_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["event_id"],
            ["astronomical_events.id"],
            name=op.f("fk_event_subscriptions_event_id_astronomical_events"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_event_subscriptions")),
        sa.UniqueConstraint(
            "user_id", "event_id", name=op.f("uq_event_subscriptions_user_id")
        ),
    )
    # The UNIQUE above covers the lookups by user; this one, those by event.
    op.create_index(
        op.f("ix_event_subscriptions_event_id"),
        "event_subscriptions",
        ["event_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_event_subscriptions_event_id"), table_name="event_subscriptions"
    )
    op.drop_table("event_subscriptions")
