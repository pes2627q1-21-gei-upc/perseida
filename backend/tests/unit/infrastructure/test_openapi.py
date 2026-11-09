import copy
import json
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI

from app.application.apod.errors import APOD_UNAVAILABLE
from app.infrastructure.events.schemas import EventResponse
from app.main import create_app


def _media_types(operation: dict[str, Any], code: str) -> set[str]:
    return set(operation["responses"][code]["content"])


def test_apod_errors_are_documented_only_as_problem_json() -> None:
    app = create_app()
    first = copy.deepcopy(app.openapi())
    second = app.openapi()

    assert first == second

    operation = second["paths"]["/api/apod"]["get"]
    assert _media_types(operation, "200") == {"application/json"}
    for code in ("422", "500", "503"):
        assert _media_types(operation, code) == {"application/problem+json"}


def test_health_schema_is_unchanged_by_the_cleanup() -> None:
    app = create_app()
    raw = copy.deepcopy(FastAPI.openapi(app))

    cleaned = app.openapi()

    assert cleaned["paths"]["/api/health"] == raw["paths"]["/api/health"]
    assert "ProblemDetails" in cleaned["components"]["schemas"]


def test_apod_503_description_cites_its_code() -> None:
    operation = create_app().openapi()["paths"]["/api/apod"]["get"]

    assert APOD_UNAVAILABLE in operation["responses"]["503"]["description"]


EVENTS_FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "events"
EVENT_PATHS = ("/api/events/active", "/api/events/upcoming")


def _event_operation(path: str) -> dict[str, Any]:
    operation: dict[str, Any] = create_app().openapi()["paths"][path]["get"]
    return operation


@pytest.mark.parametrize("path", EVENT_PATHS)
def test_tg351_c6_events_return_an_array_of_events(path: str) -> None:
    content = _event_operation(path)["responses"]["200"]["content"]

    assert set(content) == {"application/json"}
    assert content["application/json"]["schema"]["type"] == "array"
    assert content["application/json"]["schema"]["items"] == {
        "$ref": "#/components/schemas/EventResponse"
    }


@pytest.mark.parametrize("path", EVENT_PATHS)
def test_tg351_c6_events_errors_are_documented_only_as_problem_json(
    path: str,
) -> None:
    operation = _event_operation(path)

    for code in ("422", "500"):
        assert _media_types(operation, code) == {"application/problem+json"}


@pytest.mark.parametrize("path", EVENT_PATHS)
def test_tg351_c6_events_are_described(path: str) -> None:
    operation = _event_operation(path)

    assert operation["summary"]
    assert operation["description"]
    assert operation["responses"]["200"]["description"] != "Successful Response"


@pytest.mark.parametrize("path", EVENT_PATHS)
def test_tg351_c6_events_example_is_the_published_contract(path: str) -> None:
    # In the description: FastAPI drops the nulls of an OpenAPI ``example``.
    description = _event_operation(path)["description"]
    block = description.split("```json\n", 1)[1].split("\n```", 1)[0]
    example = json.loads(block)

    assert example == [
        json.loads((EVENTS_FIXTURES / f"{name}.json").read_text(encoding="utf-8"))
        for name in ("launch", "lunar")
    ]
    for event in example:
        EventResponse.model_validate(event)


def test_tg351_c6_active_documents_the_date_parameter() -> None:
    (parameter,) = _event_operation("/api/events/active")["parameters"]

    assert parameter["name"] == "date"
    assert parameter["required"] is False
    assert parameter["description"]
    assert parameter["examples"]


def test_tg351_c6_upcoming_documents_the_days_range() -> None:
    (parameter,) = _event_operation("/api/events/upcoming")["parameters"]

    assert parameter["name"] == "days"
    assert parameter["schema"]["minimum"] == 1
    assert parameter["schema"]["maximum"] == 30
    assert parameter["schema"]["default"] == 7
    assert parameter["examples"]


def test_tg351_c3_event_fields_are_always_present_and_location_may_be_null() -> None:
    schema = create_app().openapi()["components"]["schemas"]["EventResponse"]

    assert set(schema["required"]) == {
        "id",
        "title",
        "summary",
        "category",
        "starts_at",
        "ends_at",
        "location",
        "source_url",
    }
    assert {"type": "null"} in schema["properties"]["location"]["anyOf"]
    assert {"type": "null"} in schema["properties"]["source_url"]["anyOf"]
