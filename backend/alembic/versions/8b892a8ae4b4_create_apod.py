"""Create the apod table."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "8b892a8ae4b4"
down_revision: str | None = "ff2baaa95c59"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "apod",
        sa.Column("id", sa.Uuid(), server_default=sa.text("uuidv7()"), nullable=False),
        sa.Column("apod_date", sa.Date(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("explanation", sa.String(), nullable=False),
        sa.Column("media_type", sa.String(), nullable=False),
        sa.Column("media_url", sa.String(), nullable=False),
        sa.Column("copyright", sa.String(), nullable=True),
        sa.CheckConstraint(
            "media_type IN ('image', 'video')", name=op.f("ck_apod_media_type")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_apod")),
        sa.UniqueConstraint("apod_date", name=op.f("uq_apod_apod_date")),
    )


def downgrade() -> None:
    op.drop_table("apod")
