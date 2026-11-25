"""Create the observation_zones table (TG-70)."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "5b8d2f6e9a14"
down_revision: str | None = "a1c4e9b27d03"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "observation_zones",
        sa.Column("id", sa.Uuid(), server_default=sa.text("uuidv7()"), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
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
            "latitude BETWEEN -90 AND 90",
            name=op.f("ck_observation_zones_latitude_range"),
        ),
        sa.CheckConstraint(
            "longitude BETWEEN -180 AND 180",
            name=op.f("ck_observation_zones_longitude_range"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_observation_zones")),
    )
    # Spatial index for the proximity queries (TG-70), on the same expression as
    # astronomical_events (TG-50); also declared in ObservationZoneRow so that
    # ``alembic check`` matches.
    op.create_index(
        "ix_observation_zones_location",
        "observation_zones",
        [sa.text("(ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography)")],
        postgresql_using="gist",
    )


def downgrade() -> None:
    op.drop_table("observation_zones")
