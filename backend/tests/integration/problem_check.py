"""Schemathesis check: every error is an RFC 9457 problem+json (ADR-0018)."""

import json
from typing import Any

PROBLEM_MEDIA_TYPE = "application/problem+json"
REQUIRED_FIELDS = ("type", "title", "status", "detail", "code")


def check_problem_details(ctx: Any, response: Any, case: Any) -> None:
    """Fail unless a 4xx/5xx is problem+json with the ADR-0018 fields."""
    if response.status_code < 400:
        return
    content_type = response.headers.get("content-type", [""])[0]
    if not content_type.startswith(PROBLEM_MEDIA_TYPE):
        raise AssertionError(
            f"{response.status_code} is not {PROBLEM_MEDIA_TYPE}: {content_type!r}"
        )
    body = json.loads(response.content)
    missing = [field for field in REQUIRED_FIELDS if field not in body]
    if missing:
        raise AssertionError(f"problem+json lacks fields: {', '.join(missing)}")
    if body["status"] != response.status_code:
        raise AssertionError(
            f"problem+json status {body['status']} != HTTP {response.status_code}"
        )
