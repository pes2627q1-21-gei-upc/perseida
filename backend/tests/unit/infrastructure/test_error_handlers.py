"""Unit tests of the error mapping helpers. TG-304 (US TG-44)."""

import json
import uuid
from collections.abc import Awaitable, Callable
from typing import Any

import pytest
from starlette.requests import Request
from starlette.responses import Response

from app.application.shared.errors import (
    ApplicationError,
    ExternalServiceError,
    ForbiddenError,
    UnauthorizedError,
)
from app.domain.shared.errors import (
    BusinessRuleViolation,
    ConflictError,
    DomainError,
    NotFoundError,
    ValidationError,
)
from app.infrastructure.api import error_handlers
from app.infrastructure.api.correlation import (
    CorrelationIdMiddleware,
    correlation_id_var,
    get_correlation_id,
)
from app.infrastructure.api.problem import problem_response

Handler = Callable[[Request, Exception], Awaitable[Response]]


def make_request(path: str = "/x", state: dict[str, object] | None = None) -> Request:
    scope: dict[str, Any] = {
        "type": "http",
        "method": "GET",
        "path": path,
        "headers": [],
        "query_string": b"",
        "state": state or {},
    }
    return Request(scope)


class _CustomNotFoundError(NotFoundError):
    pass


@pytest.mark.parametrize(
    ("exc", "status"),
    [
        (NotFoundError("C"), 404),
        (ConflictError("C"), 409),
        (ValidationError("C"), 422),
        (BusinessRuleViolation("C"), 422),
        (UnauthorizedError("C"), 401),
        (ForbiddenError("C"), 403),
        (ExternalServiceError("C"), 503),
        (DomainError("C"), 400),
        (ApplicationError("C"), 400),
        (_CustomNotFoundError("C"), 404),
        (RuntimeError("x"), 400),
    ],
)
def test_resolve_status(exc: Exception, status: int) -> None:
    assert error_handlers.resolve_status(exc) == status


@pytest.mark.parametrize(
    ("loc", "field"),
    [
        (("body", "name"), "name"),
        (("query", "page"), "page"),
        (("body", "items", 0, "id"), "items.0.id"),
        (("name",), "name"),
        ((), ""),
    ],
)
def test_field_name_strips_location_prefix(
    loc: tuple[int | str, ...], field: str
) -> None:
    assert error_handlers._field_name(loc) == field


@pytest.mark.parametrize(
    "handler",
    [
        error_handlers._handle_domain_or_application_error,
        error_handlers._handle_validation_error,
        error_handlers._handle_http_exception,
    ],
)
async def test_handlers_reraise_unexpected_exception_types(handler: Handler) -> None:
    boom = RuntimeError("boom")

    with pytest.raises(RuntimeError) as info:
        await handler(make_request(), boom)

    assert info.value is boom


def test_get_correlation_id_prefers_request_state() -> None:
    assert get_correlation_id(make_request(state={"correlation_id": "abc"})) == "abc"


def test_get_correlation_id_falls_back_to_context_var() -> None:
    token = correlation_id_var.set("from-var")
    try:
        assert get_correlation_id(make_request()) == "from-var"
    finally:
        correlation_id_var.reset(token)


def test_get_correlation_id_none_when_unbound() -> None:
    assert get_correlation_id(make_request()) is None


def test_problem_response_generates_id_when_unbound() -> None:
    response = problem_response(make_request("/p"), 404, "NOT_FOUND", "gone")
    body = json.loads(bytes(response.body))

    assert uuid.UUID(body["correlation_id"]).version == 4
    assert response.headers["X-Correlation-ID"] == body["correlation_id"]
    assert body["instance"] == "/p"
    assert "errors" not in body


def test_problem_response_includes_errors_and_extra_headers() -> None:
    response = problem_response(
        make_request(),
        422,
        "VALIDATION_ERROR",
        "bad",
        errors=[{"field": "a", "message": "m", "type": "t"}],
        headers={"Allow": "GET"},
    )
    body = json.loads(bytes(response.body))

    assert body["errors"] == [{"field": "a", "message": "m", "type": "t"}]
    assert response.headers["Allow"] == "GET"
    assert response.headers["content-type"] == "application/problem+json"


async def test_middleware_passes_through_non_http_scopes() -> None:
    seen: list[str] = []

    async def inner(scope: Any, receive: Any, send: Any) -> None:
        seen.append(scope["type"])

    await CorrelationIdMiddleware(inner)({"type": "lifespan"}, None, None)  # type: ignore[arg-type]

    assert seen == ["lifespan"]


@pytest.mark.parametrize("incoming", [b"abc\n", b"abc\r\n", b"\nabc"])
async def test_middleware_rejects_ids_with_line_breaks(incoming: bytes) -> None:
    captured: list[str | None] = []

    async def inner(scope: Any, receive: Any, send: Any) -> None:
        captured.append(correlation_id_var.get())

    scope: dict[str, Any] = {
        "type": "http",
        "headers": [(b"x-correlation-id", incoming)],
    }
    await CorrelationIdMiddleware(inner)(scope, None, None)  # type: ignore[arg-type]

    assert captured[0] is not None
    assert "\n" not in captured[0]
    assert captured[0] != incoming.decode()
    assert uuid.UUID(captured[0]).version == 4


async def test_middleware_binds_then_resets_context_var() -> None:
    captured: list[str | None] = []
    sent: list[dict[str, Any]] = []

    async def inner(scope: Any, receive: Any, send: Any) -> None:
        captured.append(correlation_id_var.get())
        await send({"type": "http.response.start", "status": 200, "headers": []})

    async def send(message: Any) -> None:
        sent.append(message)

    scope: dict[str, Any] = {
        "type": "http",
        "headers": [(b"x-correlation-id", b"abc-1")],
    }
    await CorrelationIdMiddleware(inner)(scope, None, send)  # type: ignore[arg-type]

    assert captured == ["abc-1"]
    assert correlation_id_var.get() is None
    assert (b"x-correlation-id", b"abc-1") in sent[0]["headers"]
    assert scope["state"]["correlation_id"] == "abc-1"
