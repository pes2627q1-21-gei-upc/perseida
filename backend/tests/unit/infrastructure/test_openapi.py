import copy
from typing import Any

from fastapi import FastAPI

from app.application.apod.errors import APOD_UNAVAILABLE
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
