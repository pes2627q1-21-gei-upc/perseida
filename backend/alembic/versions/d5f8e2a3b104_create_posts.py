"""Create the posts table for community event publications."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d5f8e2a3b104"
down_revision: str | None = "c4d8e1a7b952"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "posts",
        sa.Column("id", sa.Uuid(), server_default=sa.text("uuidv7()"), nullable=False),
        sa.Column("event_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("text", sa.String(length=1000), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("edited_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "length(text) >= 1 AND length(text) <= 1000",
            name=op.f("ck_posts_post_text_length"),
        ),
        sa.ForeignKeyConstraint(
            ["event_id"],
            ["astronomical_events.id"],
            name=op.f("fk_posts_event_id_astronomical_events"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_posts_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_posts")),
    )
    op.create_index(
        "ix_posts_event_id_created_at_id",
        "posts",
        ["event_id", sa.text("created_at DESC"), sa.text("id DESC")],
    )
    op.create_index(
        op.f("ix_posts_user_id"),
        "posts",
        ["user_id"],
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_posts_user_id"), table_name="posts")
    op.drop_index("ix_posts_event_id_created_at_id", table_name="posts")
    op.drop_table("posts")
