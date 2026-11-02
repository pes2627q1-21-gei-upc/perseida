"""Contract of the event DTO shared with #351, #52 and Spotwise (TG-50, task #387).

The JSON examples in tests/fixtures/events/ are the published contract: each one
must validate against ``EventResponse`` and serialise back to the same JSON.
"""

import json
from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError

from app.domain.events.models import EventCategory
from app.infrastructure.events.schemas import EventResponse

FIXTURES = Path(__file__).resolve().parents[3] / "fixtures" / "events"
EXAMPLES = sorted(FIXTURES.glob("*.json"))
FIELDS = {
    "id",
    "title",
    "summary",
    "category",
    "starts_at",
    "ends_at",
    "location",
    "source_url",
}


def _load(name: str) -> dict[str, Any]:
    data: dict[str, Any] = json.loads(
        (FIXTURES / f"{name}.json").read_text(encoding="utf-8")
    )
    return data


@pytest.mark.parametrize("path", EXAMPLES, ids=lambda p: p.stem)
def test_each_example_round_trips_unchanged(path: Path) -> None:
    """TG-50 criteri 1: els exemples publicats compleixen el contracte."""
    raw = json.loads(path.read_text(encoding="utf-8"))

    event = EventResponse.model_validate(raw)

    assert event.model_dump(mode="json") == raw


def test_examples_cover_every_category_with_and_without_location() -> None:
    """TG-50 tasca #387: un exemple per categoria, amb i sense ubicació."""
    examples = [json.loads(p.read_text(encoding="utf-8")) for p in EXAMPLES]

    assert {e["category"] for e in examples} == {c.value for c in EventCategory}
    assert any(e["location"] is not None for e in examples)
    assert any(e["location"] is None for e in examples)


def test_categories_are_the_ones_agreed_with_spotwise() -> None:
    assert {c.value for c in EventCategory} == {
        "lunar",
        "solar",
        "meteor_shower",
        "launch",
    }


def _published_schema() -> dict[str, Any]:
    """The schema FastAPI publishes for responses (serialization mode)."""
    return EventResponse.model_json_schema(mode="serialization")


def test_every_field_is_required_in_the_openapi_schema() -> None:
    """Nullable fields are sent as ``null``, never omitted (#351 criteri 3)."""
    schema = _published_schema()

    assert set(schema["properties"]) == FIELDS
    assert set(schema["required"]) == FIELDS


@pytest.mark.parametrize("field", ["starts_at", "ends_at"])
def test_dates_are_published_as_date_time(field: str) -> None:
    prop = _published_schema()["properties"][field]

    assert prop["type"] == "string"
    assert prop["format"] == "date-time"


def test_id_is_published_with_a_standard_uuid_format() -> None:
    prop = _published_schema()["properties"]["id"]

    assert prop["type"] == "string"
    assert prop["format"] == "uuid"


def test_rejects_end_before_start() -> None:
    raw = _load("launch") | {"ends_at": "2026-11-03T21:14:59Z"}

    with pytest.raises(ValidationError, match="ends_at"):
        EventResponse.model_validate(raw)


def test_accepts_an_instant_event() -> None:
    event = EventResponse.model_validate(_load("lunar"))

    assert event.ends_at == event.starts_at


def test_rejects_dates_without_time_zone() -> None:
    raw = _load("launch") | {"starts_at": "2026-11-03T21:15:00"}

    with pytest.raises(ValidationError):
        EventResponse.model_validate(raw)


def test_serialises_dates_in_utc() -> None:
    raw = _load("launch") | {
        "starts_at": "2026-11-03T22:15:00+01:00",
        "ends_at": "2026-11-04T00:45:00+01:00",
    }

    dumped = EventResponse.model_validate(raw).model_dump(mode="json")

    assert dumped["starts_at"] == "2026-11-03T21:15:00Z"
    assert dumped["ends_at"] == "2026-11-03T23:45:00Z"


def test_rejects_unknown_category() -> None:
    raw = _load("launch") | {"category": "asteroid"}

    with pytest.raises(ValidationError):
        EventResponse.model_validate(raw)


def test_rejects_id_that_is_not_uuid_v7() -> None:
    raw = _load("launch") | {"id": "8f14e45f-ceea-467f-a0e8-4b1e2f3c5d6a"}

    with pytest.raises(ValidationError):
        EventResponse.model_validate(raw)


@pytest.mark.parametrize(
    "location",
    [
        {"latitude": 90.1, "longitude": 0},
        {"latitude": -90.1, "longitude": 0},
        {"latitude": 0, "longitude": 180.1},
        {"latitude": 0, "longitude": -180.1},
    ],
)
def test_rejects_coordinates_out_of_range(location: dict[str, float]) -> None:
    raw = _load("launch") | {"location": location}

    with pytest.raises(ValidationError):
        EventResponse.model_validate(raw)


@pytest.mark.parametrize("field", ["title", "summary"])
def test_rejects_blank_texts(field: str) -> None:
    raw = _load("launch") | {field: "   "}

    with pytest.raises(ValidationError):
        EventResponse.model_validate(raw)


def test_rejects_non_https_source_url() -> None:
    raw = _load("launch") | {"source_url": "http://ll.thespacedevs.com/x/"}

    with pytest.raises(ValidationError):
        EventResponse.model_validate(raw)


@pytest.mark.parametrize(
    "raw_url",
    ["  https://example.com/a  ", "https://example.com/a\n"],
)
def test_source_url_is_published_normalised(raw_url: str) -> None:
    """Regressió de la review de la PR #76: l'URL no surt mai sense normalitzar."""
    raw = _load("launch") | {"source_url": raw_url}

    event = EventResponse.model_validate(raw)

    assert event.source_url == "https://example.com/a"


def test_rejects_unknown_fields() -> None:
    raw = _load("launch") | {"type": "launch"}

    with pytest.raises(ValidationError):
        EventResponse.model_validate(raw)
