"""Add the recommended local (name and address) to the outings (TG-661)."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a1c4e9b27d03"
down_revision: str | None = "e7a3c5b9d104"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "outings", sa.Column("place_name", sa.String(length=120), nullable=True)
    )
    op.add_column(
        "outings", sa.Column("place_address", sa.String(length=200), nullable=True)
    )
    op.create_check_constraint(
        op.f("ck_outings_place_all_or_none"),
        "outings",
        "(place_name IS NULL) = (place_address IS NULL)",
    )
    op.create_check_constraint(
        op.f("ck_outings_place_name_not_empty"),
        "outings",
        "place_name IS NULL OR char_length(place_name) >= 1",
    )


def downgrade() -> None:
    op.drop_constraint(op.f("ck_outings_place_name_not_empty"), "outings")
    op.drop_constraint(op.f("ck_outings_place_all_or_none"), "outings")
    op.drop_column("outings", "place_address")
    op.drop_column("outings", "place_name")
