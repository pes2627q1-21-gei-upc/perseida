"""Spotwise mock: the example answer of the Spotwise document (TG-352 criteri 3).

Used when no ``SPOTWISE_API_TOKEN`` is configured (local, CI).
"""

import json
from pathlib import Path
from typing import Any

from app.domain.meeting_points.models import SessionProfile, Space
from app.domain.shared.location import Location
from app.infrastructure.meeting_points.spotwise_client import to_spaces

EXAMPLES_FILE = Path(__file__).with_name("spotwise_examples.json")


def _load_examples() -> list[Space]:
    records: list[Any] = json.loads(EXAMPLES_FILE.read_text(encoding="utf-8"))
    return to_spaces(records)


class ExampleSpaceSearch:
    """Always the example spaces, whatever the point and the profile."""

    def __init__(self) -> None:
        self._spaces = _load_examples()

    async def search(self, near: Location, profile: SessionProfile) -> list[Space]:
        return list(self._spaces)
