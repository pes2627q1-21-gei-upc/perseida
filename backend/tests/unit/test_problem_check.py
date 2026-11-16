"""The schemathesis check for RFC 9457 errors fails on bad ones (TG-360, US #360,
criteris 2 i 10)."""

import json
from types import SimpleNamespace
from typing import Any

import pytest

from tests.integration.problem_check import check_problem_details

PROBLEM = {
    "type": "about:blank",
    "title": "Not Found",
    "status": 404,
    "detail": "No such thing.",
    "code": "NOT_FOUND",
}


def response(
    status: int = 404,
    content_type: str = "application/problem+json",
    body: Any = PROBLEM,
) -> Any:
    return SimpleNamespace(
        status_code=status,
        headers={"content-type": [content_type]},
        content=json.dumps(body).encode(),
    )


def test_a_success_response_is_not_checked() -> None:
    check_problem_details(None, response(200, "application/json", {"ok": True}), None)


@pytest.mark.parametrize("status", [400, 404, 422, 500, 503])
def test_a_valid_problem_passes(status: int) -> None:
    check_problem_details(
        None, response(status, body={**PROBLEM, "status": status}), None
    )


def test_an_error_that_is_not_problem_json_fails() -> None:
    with pytest.raises(AssertionError, match=r"application/problem\+json"):
        check_problem_details(None, response(content_type="application/json"), None)


@pytest.mark.parametrize("missing", ["type", "title", "status", "detail", "code"])
def test_an_error_missing_a_field_fails(missing: str) -> None:
    body = {key: value for key, value in PROBLEM.items() if key != missing}

    with pytest.raises(AssertionError, match=missing):
        check_problem_details(None, response(body=body), None)


def test_an_error_whose_status_field_differs_fails() -> None:
    with pytest.raises(AssertionError, match="status"):
        check_problem_details(
            None, response(404, body={**PROBLEM, "status": 500}), None
        )
