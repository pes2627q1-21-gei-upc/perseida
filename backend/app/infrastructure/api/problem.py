import uuid
from http import HTTPStatus
from typing import Any

from fastapi.responses import JSONResponse
from starlette.requests import Request

from app.infrastructure.api.correlation import CORRELATION_HEADER, get_correlation_id

PROBLEM_MEDIA_TYPE = "application/problem+json"


def status_phrase(status: int) -> str:
    """Standard HTTP phrase of a status, or a generic one if non-standard."""
    try:
        return HTTPStatus(status).phrase
    except ValueError:
        return "HTTP error"


def problem_response(
    request: Request,
    status: int,
    code: str,
    detail: str,
    errors: list[dict[str, str]] | None = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    """Build an RFC 9457 problem+json response."""
    correlation_id = get_correlation_id(request) or str(uuid.uuid4())
    body: dict[str, Any] = {
        "type": "about:blank",
        "title": status_phrase(status),
        "status": status,
        "detail": detail,
        "instance": request.url.path,
        "code": code,
        "correlation_id": correlation_id,
    }
    if errors is not None:
        body["errors"] = errors
    response_headers = dict(headers or {})
    response_headers[CORRELATION_HEADER] = correlation_id
    return JSONResponse(
        body,
        status_code=status,
        media_type=PROBLEM_MEDIA_TYPE,
        headers=response_headers,
    )
