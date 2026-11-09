import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    Double,
    Index,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    text,
)
from sqlmodel import Field, SQLModel


def _timestamptz(*, index: bool = False) -> Column[datetime]:
    return Column(DateTime(timezone=True), nullable=False, index=index)


def _timestamptz_now() -> Column[datetime]:
    return Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))


class AstronomicalEventRow(SQLModel, table=True):
    """Table ``astronomical_events``. The domain entity is ``AstronomicalEvent``."""

    __tablename__ = "astronomical_events"
    # Closed values as VARCHAR + named CHECK (ADR-0023).
    __table_args__ = (
        CheckConstraint(
            "source IN ('launch_library_2', 'usno', 'skyfield', 'catalog')",
            name="source",
        ),
        CheckConstraint(
            "category IN ('lunar', 'solar', 'meteor_shower', 'launch')",
            name="category",
        ),
        CheckConstraint("ends_at >= starts_at", name="ends_not_before_starts"),
        CheckConstraint(
            "(latitude IS NULL) = (longitude IS NULL)", name="location_complete"
        ),
        CheckConstraint("latitude BETWEEN -90 AND 90", name="latitude_range"),
        CheckConstraint("longitude BETWEEN -180 AND 180", name="longitude_range"),
        # Stable id: fetching an event again from its source keeps the row (TG-50).
        UniqueConstraint("source", "external_id"),
        # Spatial index for proximity queries (TG-50); same expression as the
        # migration so that ``alembic check`` sees no difference.
        Index(
            "ix_astronomical_events_location",
            text("(ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography)"),
            postgresql_using="gist",
            postgresql_where=text("latitude IS NOT NULL"),
        ),
    )

    id: uuid.UUID = Field(
        sa_column=Column(Uuid(), primary_key=True, server_default=text("uuidv7()"))
    )
    source: str = Field(sa_column=Column(String(32), nullable=False))
    external_id: str = Field(sa_column=Column(String(255), nullable=False))
    title: str = Field(sa_column=Column(Text(), nullable=False))
    summary: str = Field(sa_column=Column(Text(), nullable=False))
    category: str = Field(sa_column=Column(String(16), nullable=False))
    starts_at: datetime = Field(sa_column=_timestamptz(index=True))
    ends_at: datetime = Field(sa_column=_timestamptz(index=True))
    latitude: float | None = Field(
        default=None, sa_column=Column(Double(), nullable=True)
    )
    longitude: float | None = Field(
        default=None, sa_column=Column(Double(), nullable=True)
    )
    source_url: str | None = Field(
        default=None, sa_column=Column(Text(), nullable=True)
    )
    # Filled in by PostgreSQL.
    created_at: datetime | None = Field(default=None, sa_column=_timestamptz_now())
    updated_at: datetime | None = Field(default=None, sa_column=_timestamptz_now())
