import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    Double,
    Index,
    Text,
    Uuid,
    text,
)
from sqlmodel import Field, SQLModel

# Same expression as the events (TG-50): a proximity query must use it verbatim
# for the spatial index to serve it.
from app.infrastructure.events.tables import LOCATION_GEOGRAPHY


def _timestamptz_now() -> Column[datetime]:
    return Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))


class ObservationZoneRow(SQLModel, table=True):
    """Table ``observation_zones`` (TG-70). The domain entity is
    ``ObservationZone``."""

    __tablename__ = "observation_zones"
    __table_args__ = (
        CheckConstraint("latitude BETWEEN -90 AND 90", name="latitude_range"),
        CheckConstraint("longitude BETWEEN -180 AND 180", name="longitude_range"),
        # Spatial index for the proximity queries; same expression as the
        # migration so that ``alembic check`` sees no difference.
        Index(
            "ix_observation_zones_location",
            text(LOCATION_GEOGRAPHY),
            postgresql_using="gist",
        ),
    )

    id: uuid.UUID = Field(
        sa_column=Column(Uuid(), primary_key=True, server_default=text("uuidv7()"))
    )
    name: str = Field(sa_column=Column(Text(), nullable=False))
    latitude: float = Field(sa_column=Column(Double(), nullable=False))
    longitude: float = Field(sa_column=Column(Double(), nullable=False))
    # Filled in by PostgreSQL.
    created_at: datetime | None = Field(default=None, sa_column=_timestamptz_now())
    updated_at: datetime | None = Field(default=None, sa_column=_timestamptz_now())
