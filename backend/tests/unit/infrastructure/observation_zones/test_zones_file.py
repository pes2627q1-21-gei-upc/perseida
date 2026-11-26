"""TG-70 criteri 5: the initial observation zones live in an editable JSON file
that the loader validates with the domain."""

import json
import uuid
from pathlib import Path

import pytest

from app.domain.shared.errors import DomainError
from app.infrastructure.observation_zones.load_zones import read_zones

ZONES = (
    Path(__file__).resolve().parents[4]
    / "app"
    / "infrastructure"
    / "observation_zones"
    / "zones.json"
)
# Bounding box of Catalonia.
LATITUDES = (40.5, 42.9)
LONGITUDES = (0.15, 3.35)


def test_tg70_c5_the_file_has_the_nine_zones() -> None:
    assert len(read_zones(ZONES)) == 9


def test_tg70_c5_ids_are_unique_uuid7_and_names_are_not_repeated() -> None:
    zones = read_zones(ZONES)

    assert all(zone.id.version == 7 for zone in zones)
    assert len({zone.id for zone in zones}) == len(zones)
    assert len({zone.name for zone in zones}) == len(zones)


def test_tg70_c5_every_zone_documents_an_https_source() -> None:
    entries = json.loads(ZONES.read_text(encoding="utf-8"))

    assert all(entry["source_url"].startswith("https://") for entry in entries)


def test_tg70_c5_every_zone_is_in_catalonia() -> None:
    for zone in read_zones(ZONES):
        assert LATITUDES[0] <= zone.location.latitude <= LATITUDES[1], zone.name
        assert LONGITUDES[0] <= zone.location.longitude <= LONGITUDES[1], zone.name


def test_tg70_c5_a_zone_out_of_range_fails_the_load(tmp_path: Path) -> None:
    bad = tmp_path / "zones.json"
    bad.write_text(
        json.dumps(
            [
                {
                    "id": str(uuid.uuid7()),
                    "name": "Nowhere",
                    "latitude": 91,
                    "longitude": 1,
                    "source_url": "https://example.org",
                }
            ]
        ),
        encoding="utf-8",
    )

    with pytest.raises(DomainError):
        read_zones(bad)
