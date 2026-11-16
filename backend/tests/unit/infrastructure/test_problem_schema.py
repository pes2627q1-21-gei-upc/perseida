"""``ProblemDetails`` must describe what ``problem_response`` really sends."""

import json
from typing import Any

import pytest
from starlette.requests import Request

from app.infrastructure.api.problem import problem_response
from app.infrastructure.api.schemas import ProblemDetails

FIELD_ERRORS = [{"field": "date", "message": "bad", "type": "value_error"}]


def _body(errors: list[dict[str, str]] | None) -> dict[str, Any]:
    scope: dict[str, Any] = {
        "type": "http",
        "method": "GET",
        "path": "/p",
        "headers": [],
        "query_string": b"",
        "state": {},
    }
    response = problem_response(
        Request(scope), 422, "VALIDATION_ERROR", "bad", errors=errors
    )
    body: dict[str, Any] = json.loads(bytes(response.body))
    return body


@pytest.mark.parametrize("errors", [FIELD_ERRORS, None])
def test_problem_response_body_validates_against_problem_details(
    errors: list[dict[str, str]] | None,
) -> None:
    body = _body(errors)

    parsed = ProblemDetails.model_validate(body)

    # Nothing sent is missing from the schema, nothing is invented or nulled.
    assert parsed.model_dump(exclude_unset=True) == body


def test_errors_is_optional_and_never_null_in_the_schema() -> None:
    schema = ProblemDetails.model_json_schema(mode="serialization")

    assert "errors" not in schema["required"]
    assert schema["properties"]["errors"]["type"] == "array"
