"""Create the daily_streaks table."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c4d8e1a7b952"
down_revision: str | None = "3f7c2a9d1b64"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "daily_streaks",
        sa.Column("id", sa.Uuid(), server_default=sa.text("uuidv7()"), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("current_count", sa.Integer(), nullable=False),
        sa.Column("last_activity_date", sa.Date(), nullable=False),
        sa.CheckConstraint(
            "current_count >= 1", name=op.f("ck_daily_streaks_current_count_positive")
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_daily_streaks_user_id_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_daily_streaks")),
        sa.UniqueConstraint("user_id", name=op.f("uq_daily_streaks_user_id")),
    )


def downgrade() -> None:
    op.drop_table("daily_streaks")
