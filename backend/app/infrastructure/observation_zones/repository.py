from sqlalchemy import ColumnElement, Double, Select, func, literal_column, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.sql.elements import Label
from sqlmodel import col

from app.domain.observation_zones.models import (
    ObservationZone,
    ZoneDistance,
    ZoneProximity,
)
from app.domain.shared.location import Location
from app.infrastructure.events.tables import LOCATION_GEOGRAPHY
from app.infrastructure.observation_zones.tables import ObservationZoneRow

METRES_PER_KM = 1000


def _to_entity(row: ObservationZoneRow) -> ObservationZone:
    return ObservationZone(
        id=row.id,
        name=row.name,
        location=Location(latitude=row.latitude, longitude=row.longitude),
    )


def _center(near: ZoneProximity) -> ColumnElement[object]:
    return func.geography(
        func.ST_SetSRID(
            func.ST_MakePoint(near.location.longitude, near.location.latitude), 4326
        )
    )


def find_within_statement(
    near: ZoneProximity,
) -> Select[ObservationZoneRow, float]:
    """The zones within ``near`` with their distance in metres, nearest first.

    ``ST_DWithin`` on the indexed expression becomes an ``Index Cond``;
    ``ST_Distance(...) <= r`` would read every row instead.
    """
    location: ColumnElement[object] = literal_column(LOCATION_GEOGRAPHY)
    center = _center(near)
    distance: Label[float] = func.ST_Distance(location, center, type_=Double()).label(
        "distance_m"
    )
    return (
        select(ObservationZoneRow, distance)
        .where(func.ST_DWithin(location, center, near.radius_km * METRES_PER_KM))
        .order_by(distance, col(ObservationZoneRow.id))
    )


class SqlObservationZoneRepository:
    """Observation zones stored in PostgreSQL. Each call uses its own session."""

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def save(self, zone: ObservationZone) -> None:
        async with self._session_factory() as session:
            session.add(
                ObservationZoneRow(
                    id=zone.id,
                    name=zone.name,
                    latitude=zone.location.latitude,
                    longitude=zone.location.longitude,
                )
            )
            await session.commit()

    async def find_within(self, near: ZoneProximity) -> list[ZoneDistance]:
        async with self._session_factory() as session:
            result = await session.execute(find_within_statement(near))
            return [
                ZoneDistance(zone=_to_entity(row), distance_km=distance / METRES_PER_KM)
                for row, distance in result
            ]
