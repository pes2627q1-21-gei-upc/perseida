"""Observation zones and the search of the ones near a point (TG-70).

The weather and the score of a zone (``cloudCoverage``, ``lightPollution``,
``recommendationScore`` in the domain model) belong to TG-71.
"""

import uuid
from typing import Annotated, Self

from pydantic import BaseModel, ConfigDict, StringConstraints

from app.domain.observation_zones.errors import (
    OBSERVATION_ZONE_LATITUDE_INVALID,
    OBSERVATION_ZONE_LONGITUDE_INVALID,
    OBSERVATION_ZONE_RADIUS_INVALID,
)
from app.domain.shared.errors import ValidationError
from app.domain.shared.location import Location

# Without NUL: PostgreSQL rejects it in TEXT (as the event texts).
ZoneName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, pattern=r"^[^\x00]*$"),
]


def _location(latitude: float, longitude: float) -> Location:
    """A ``Location``, or a ValidationError with a stable code (criterion 4).

    The negated comparisons also reject NaN.
    """
    if not -90 <= latitude <= 90:
        raise ValidationError(
            OBSERVATION_ZONE_LATITUDE_INVALID, "Latitude out of range"
        )
    if not -180 <= longitude <= 180:
        raise ValidationError(
            OBSERVATION_ZONE_LONGITUDE_INVALID, "Longitude out of range"
        )
    return Location(latitude=latitude, longitude=longitude)


class ObservationZone(BaseModel):
    """A place where to observe the sky."""

    model_config = ConfigDict(frozen=True)

    id: uuid.UUID
    name: ZoneName
    location: Location

    @classmethod
    def create(cls, *, name: str, latitude: float, longitude: float) -> Self:
        """Build a new zone with a UUIDv7 (ADR-0023)."""
        return cls(id=uuid.uuid7(), name=name, location=_location(latitude, longitude))


class ZoneProximity(BaseModel):
    """The zones within ``radius_km`` of ``location``, measured on the Earth."""

    model_config = ConfigDict(frozen=True)

    location: Location
    radius_km: float

    @classmethod
    def create(cls, *, latitude: float, longitude: float, radius_km: float) -> Self:
        location = _location(latitude, longitude)
        if not radius_km > 0:
            raise ValidationError(
                OBSERVATION_ZONE_RADIUS_INVALID, "Radius must be greater than 0 km"
            )
        return cls(location=location, radius_km=radius_km)


class ZoneDistance(BaseModel):
    """A zone found by a proximity search and its distance to the point."""

    model_config = ConfigDict(frozen=True)

    zone: ObservationZone
    distance_km: float
