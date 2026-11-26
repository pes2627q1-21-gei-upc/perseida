"""Initial load of the observation zones (TG-70, criteri 5).

The zones are in ``zones.json``, next to this file. The entrypoint runs this
module after ``alembic upgrade head`` on every start, so a zone added to the
file reaches the database on the next deploy. Removing an entry from the file
does not delete the zone from the database, on purpose.
"""

import asyncio
import json
from pathlib import Path

from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncConnection, create_async_engine

from app.domain.observation_zones.models import ObservationZone
from app.domain.shared.location import Location
from app.infrastructure.observation_zones.tables import ObservationZoneRow
from app.infrastructure.persistence.config import DatabaseSettings

ZONES_FILE = Path(__file__).with_name("zones.json")


def read_zones(path: Path = ZONES_FILE) -> list[ObservationZone]:
    """The zones of the file; the domain rejects a badly edited entry."""
    entries = json.loads(path.read_text(encoding="utf-8"))
    return [
        ObservationZone(
            id=entry["id"],
            name=entry["name"],
            location=Location(latitude=entry["latitude"], longitude=entry["longitude"]),
        )
        for entry in entries
    ]


async def load_zones(connection: AsyncConnection, zones: list[ObservationZone]) -> None:
    """Insert the zones, or update the name and place of the ones that exist."""
    for zone in zones:
        values = {
            "id": zone.id,
            "name": zone.name,
            "latitude": zone.location.latitude,
            "longitude": zone.location.longitude,
        }
        statement = insert(ObservationZoneRow).values(**values)
        await connection.execute(
            statement.on_conflict_do_update(
                index_elements=["id"],
                set_={
                    "name": statement.excluded.name,
                    "latitude": statement.excluded.latitude,
                    "longitude": statement.excluded.longitude,
                    "updated_at": func.now(),
                },
            )
        )


async def main() -> None:
    zones = read_zones()
    engine = create_async_engine(DatabaseSettings().database_url)
    try:
        async with engine.begin() as connection:
            await load_zones(connection, zones)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
