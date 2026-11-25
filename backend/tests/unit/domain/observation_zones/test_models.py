"""Observation zones and the proximity query (TG-70, criteris 1 i 4)."""

import math

import pytest

from app.domain.observation_zones.errors import (
    OBSERVATION_ZONE_LATITUDE_INVALID,
    OBSERVATION_ZONE_LONGITUDE_INVALID,
    OBSERVATION_ZONE_RADIUS_INVALID,
)
from app.domain.observation_zones.models import ObservationZone, ZoneProximity
from app.domain.shared.errors import DomainError, ValidationError
from app.domain.shared.location import Location


def test_tg70_c1_a_new_zone_has_a_uuid7_a_name_and_a_location() -> None:
    zone = ObservationZone.create(name="Montsec", latitude=42.0517, longitude=0.7296)

    assert zone.id.version == 7
    assert zone.name == "Montsec"
    assert zone.location == Location(latitude=42.0517, longitude=0.7296)


def test_tg70_c1_each_new_zone_gets_its_own_id() -> None:
    first = ObservationZone.create(name="A", latitude=0, longitude=0)
    second = ObservationZone.create(name="A", latitude=0, longitude=0)

    assert first.id != second.id


@pytest.mark.parametrize("latitude", [-90.0, 90.0])
@pytest.mark.parametrize("longitude", [-180.0, 180.0])
def test_tg70_c4_the_edges_of_the_ranges_are_valid(
    latitude: float, longitude: float
) -> None:
    zone = ObservationZone.create(name="Edge", latitude=latitude, longitude=longitude)
    near = ZoneProximity.create(latitude=latitude, longitude=longitude, radius_km=1)

    assert zone.location == Location(latitude=latitude, longitude=longitude)
    assert near.location == zone.location


@pytest.mark.parametrize("latitude", [-90.0001, 90.0001, math.nan])
def test_tg70_c4_a_latitude_out_of_range_is_rejected(latitude: float) -> None:
    with pytest.raises(ValidationError) as zone_error:
        ObservationZone.create(name="Out", latitude=latitude, longitude=0)
    with pytest.raises(ValidationError) as query_error:
        ZoneProximity.create(latitude=latitude, longitude=0, radius_km=10)

    assert zone_error.value.code == OBSERVATION_ZONE_LATITUDE_INVALID
    assert query_error.value.code == OBSERVATION_ZONE_LATITUDE_INVALID


@pytest.mark.parametrize("longitude", [-180.0001, 180.0001, math.nan])
def test_tg70_c4_a_longitude_out_of_range_is_rejected(longitude: float) -> None:
    with pytest.raises(ValidationError) as zone_error:
        ObservationZone.create(name="Out", latitude=0, longitude=longitude)
    with pytest.raises(ValidationError) as query_error:
        ZoneProximity.create(latitude=0, longitude=longitude, radius_km=10)

    assert zone_error.value.code == OBSERVATION_ZONE_LONGITUDE_INVALID
    assert query_error.value.code == OBSERVATION_ZONE_LONGITUDE_INVALID


@pytest.mark.parametrize("radius_km", [0.0, -0.0, -1.0, math.nan])
def test_tg70_c4_a_radius_not_greater_than_zero_is_rejected(radius_km: float) -> None:
    with pytest.raises(ValidationError) as error:
        ZoneProximity.create(latitude=41.39, longitude=2.17, radius_km=radius_km)

    assert error.value.code == OBSERVATION_ZONE_RADIUS_INVALID


def test_tg70_c4_any_positive_radius_is_valid() -> None:
    near = ZoneProximity.create(latitude=41.39, longitude=2.17, radius_km=0.001)

    assert near.radius_km == 0.001
    assert near.location == Location(latitude=41.39, longitude=2.17)


def test_tg70_c4_the_codes_are_stable_domain_errors() -> None:
    assert issubclass(ValidationError, DomainError)
    assert OBSERVATION_ZONE_LATITUDE_INVALID == "OBSERVATION_ZONE_LATITUDE_INVALID"
    assert OBSERVATION_ZONE_LONGITUDE_INVALID == "OBSERVATION_ZONE_LONGITUDE_INVALID"
    assert OBSERVATION_ZONE_RADIUS_INVALID == "OBSERVATION_ZONE_RADIUS_INVALID"


def test_tg70_c1_a_zone_name_cannot_be_blank() -> None:
    with pytest.raises(ValueError):
        ObservationZone.create(name="   ", latitude=0, longitude=0)
