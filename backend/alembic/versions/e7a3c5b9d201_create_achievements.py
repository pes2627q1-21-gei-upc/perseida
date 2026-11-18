"""Create the achievements catalog and user_achievements, and load the catalog (TG-58).

The catalog is in ``alembic/seed/achievements.json``. Each achievement has a fixed
id in the file, so ids never change across a downgrade and an upgrade. More
achievements are added as rows (a new migration or data load), without touching
the engine code.

Downgrading drops both tables, and with them the achievements users unlocked.
"""

import json
from collections.abc import Sequence
from pathlib import Path

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import insert

from alembic import op

revision: str = "e7a3c5b9d201"
down_revision: str | None = "c4d8e1a7b952"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SEED = Path(__file__).resolve().parents[1] / "seed" / "achievements.json"

achievements = sa.table(
    "achievements",
    sa.column("id", sa.Uuid()),
    sa.column("code", sa.String()),
    sa.column("name", sa.String()),
    sa.column("description", sa.Text()),
    sa.column("kind", sa.String()),
    sa.column("threshold", sa.Integer()),
    sa.column("category", sa.String()),
    sa.column("position", sa.Integer()),
)


def upgrade() -> None:
    op.create_table(
        "achievements",
        sa.Column("id", sa.Uuid(), server_default=sa.text("uuidv7()"), nullable=False),
        sa.Column("code", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("threshold", sa.Integer(), nullable=False),
        sa.Column("category", sa.String(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.CheckConstraint(
            "threshold >= 1", name=op.f("ck_achievements_threshold_positive")
        ),
        sa.CheckConstraint(
            "position >= 1", name=op.f("ck_achievements_position_positive")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_achievements")),
        sa.UniqueConstraint("code", name=op.f("uq_achievements_code")),
        sa.UniqueConstraint(
            "category", "position", name=op.f("uq_achievements_category")
        ),
    )
    op.create_table(
        "user_achievements",
        sa.Column("id", sa.Uuid(), server_default=sa.text("uuidv7()"), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("achievement_id", sa.Uuid(), nullable=False),
        sa.Column(
            "unlocked_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_user_achievements_user_id_users"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["achievement_id"],
            ["achievements.id"],
            name=op.f("fk_user_achievements_achievement_id_achievements"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_user_achievements")),
        sa.UniqueConstraint(
            "user_id", "achievement_id", name=op.f("uq_user_achievements_user_id")
        ),
    )
    catalog = json.loads(SEED.read_text(encoding="utf-8"))
    op.execute(insert(achievements).values(catalog).on_conflict_do_nothing())


def downgrade() -> None:
    op.drop_table("user_achievements")
    op.drop_table("achievements")
