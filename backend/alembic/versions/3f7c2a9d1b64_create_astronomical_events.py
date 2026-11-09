"""Create the astronomical_events table."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "3f7c2a9d1b64"
down_revision: str | None = "8b892a8ae4b4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "astronomical_events",
        sa.Column("id", sa.Uuid(), server_default=sa.text("uuidv7()"), nullable=False),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("external_id", sa.String(length=255), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("category", sa.String(length=16), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("latitude", sa.Double(), nullable=True),
        sa.Column("longitude", sa.Double(), nullable=True),
        sa.Column("source_url", sa.Text(), nullable=True),
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
            "source IN ('launch_library_2', 'usno', 'skyfield', 'catalog')",
            name=op.f("ck_astronomical_events_source"),
        ),
        sa.CheckConstraint(
            "category IN ('lunar', 'solar', 'meteor_shower', 'launch')",
            name=op.f("ck_astronomical_events_category"),
        ),
        sa.CheckConstraint(
            "ends_at >= starts_at",
            name=op.f("ck_astronomical_events_ends_not_before_starts"),
        ),
        sa.CheckConstraint(
            "(latitude IS NULL) = (longitude IS NULL)",
            name=op.f("ck_astronomical_events_location_complete"),
        ),
        sa.CheckConstraint(
            "latitude BETWEEN -90 AND 90",
            name=op.f("ck_astronomical_events_latitude_range"),
        ),
        sa.CheckConstraint(
            "longitude BETWEEN -180 AND 180",
            name=op.f("ck_astronomical_events_longitude_range"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_astronomical_events")),
        sa.UniqueConstraint(
            "source", "external_id", name=op.f("uq_astronomical_events_source")
        ),
    )
    op.create_index(
        op.f("ix_astronomical_events_starts_at"),
        "astronomical_events",
        ["starts_at"],
    )
    op.create_index(
        op.f("ix_astronomical_events_ends_at"),
        "astronomical_events",
        ["ends_at"],
    )
    # Spatial index for proximity queries (TG-50); also declared in
    # AstronomicalEventRow so that ``alembic check`` matches.
    op.create_index(
        "ix_astronomical_events_location",
        "astronomical_events",
        [sa.text("(ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography)")],
        postgresql_using="gist",
        postgresql_where=sa.text("latitude IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_table("astronomical_events")
