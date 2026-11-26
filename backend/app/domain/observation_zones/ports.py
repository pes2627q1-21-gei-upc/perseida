from typing import Protocol

from app.domain.observation_zones.models import (
    ObservationZone,
    ZoneDistance,
    ZoneProximity,
)


class ObservationZoneRepository(Protocol):
    """Stored observation zones (TG-70)."""

    async def save(self, zone: ObservationZone) -> None:
        """Store a new ``zone``."""
        ...

    async def find_within(self, near: ZoneProximity) -> list[ZoneDistance]:
        """Return the zones within ``near.radius_km`` of ``near.location``, from
        the nearest to the farthest (ties by ``id``), each with its distance."""
        ...
