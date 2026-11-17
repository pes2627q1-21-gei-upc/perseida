"""Create the outings table (TG-629)."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "87a5c21fe4eb"
down_revision: str | None = "d5f8e2a3b104"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "outings",
        sa.Column("id", sa.Uuid(), server_default=sa.text("uuidv7()"), nullable=False),
        sa.Column("author_id", sa.Uuid(), nullable=False),
        sa.Column("event_id", sa.Uuid(), nullable=True),
        sa.Column("title", sa.String(length=120), nullable=False),
        sa.Column("description", sa.String(length=2000), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("latitude", sa.Double(), nullable=False),
        sa.Column("longitude", sa.Double(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "char_length(title) >= 1", name=op.f("ck_outings_title_not_empty")
        ),
        sa.CheckConstraint(
            "ends_at >= starts_at", name=op.f("ck_outings_ends_not_before_starts")
        ),
        sa.CheckConstraint(
            "latitude BETWEEN -90 AND 90", name=op.f("ck_outings_latitude_range")
        ),
        sa.CheckConstraint(
            "longitude BETWEEN -180 AND 180", name=op.f("ck_outings_longitude_range")
        ),
        sa.ForeignKeyConstraint(
            ["author_id"],
            ["users.id"],
            name=op.f("fk_outings_author_id_users"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["event_id"],
            ["astronomical_events.id"],
            name=op.f("fk_outings_event_id_astronomical_events"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_outings")),
    )
    op.create_index(
        "ix_outings_author_id_starts_at", "outings", ["author_id", "starts_at"]
    )
    op.create_index(
        "ix_outings_event_id_starts_at", "outings", ["event_id", "starts_at"]
    )
    op.create_index(op.f("ix_outings_starts_at"), "outings", ["starts_at"])


def downgrade() -> None:
    op.drop_table("outings")
