"""Spotwise spaces for the meeting point tests (TG-352).

``LIBRARY_12`` and ``STUDY_ROOM_31`` are the two spaces of the Spotwise
example answer (``tests/fixtures/spotwise_espais_watch_party.json``) once
converted to the domain.
"""

from typing import Any

from app.domain.meeting_points.models import PlugLevel, SilenceLevel, Space, SpaceType
from app.domain.shared.location import Location

LIBRARY_12 = Space(
    id=12,
    name="Biblioteca d'exemple Sagrada Família",
    type=SpaceType.LIBRARY,
    address="Carrer d'Exemple, 1, 08025 Barcelona",
    location=Location(latitude=41.4045, longitude=2.1712),
    wifi=True,
    silence=SilenceLevel.MURMUR,
    plugs=PlugLevel.MANY,
    group_friendly=True,
    distance_m=290,
    open_now=True,
)

STUDY_ROOM_31 = Space(
    id=31,
    name="Sala d'estudi d'exemple",
    type=SpaceType.LIBRARY,
    address="Carrer d'Exemple, 20, 08013 Barcelona",
    location=Location(latitude=41.3998, longitude=2.1871),
    wifi=True,
    silence=None,
    plugs=None,
    group_friendly=None,
    distance_m=1140,
    open_now=False,
)

EXAMPLE_SPACES = (LIBRARY_12, STUDY_ROOM_31)


def make_space(**overrides: Any) -> Space:
    """A space that every profile keeps; ``overrides`` change any field."""
    fields: dict[str, Any] = {
        "id": 1,
        "name": "Cafeteria d'exemple",
        "type": SpaceType.CAFE,
        "address": "Carrer d'Exemple, 5, 08001 Barcelona",
        "location": Location(latitude=41.3851, longitude=2.1734),
        "wifi": True,
        "silence": SilenceLevel.SILENT,
        "plugs": PlugLevel.MANY,
        "group_friendly": True,
        "distance_m": 100,
        "open_now": True,
    }
    fields.update(overrides)
    return Space(**fields)
