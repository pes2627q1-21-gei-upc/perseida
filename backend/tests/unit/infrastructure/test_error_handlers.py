"""Unit tests of the error mapping helpers. TG-304 (US TG-44)."""

import json
import uuid
from collections.abc import Awaitable, Callable
from typing import Any

import pytest
from fastapi import APIRouter, FastAPI
from fastapi.exceptions import RequestValidationError
from httpx import ASGITransport, AsyncClient
from starlette.exceptions import HTTPException as StarletteHTTPException
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


async def test_validation_errors_are_grouped_by_field_keeping_the_first() -> None:
    exc = RequestValidationError(
        [
            {"loc": ("body", "name"), "msg": "first", "type": "a"},
            {"loc": ("body", "age"), "msg": "other", "type": "b"},
            {"loc": ("body", "name"), "msg": "second", "type": "c"},
        ],
        body={"name": 1, "age": "x"},
    )

    response = await error_handlers._handle_validation_error(make_request(), exc)
    body = json.loads(bytes(response.body))

    assert body["errors"] == [
        {"field": "name", "message": "first", "type": "a"},
        {"field": "age", "message": "other", "type": "b"},
    ]


@pytest.mark.parametrize(
    ("loc", "body", "error_type", "expected"),
    [
        (("body", "x", "int"), {"x": "abc"}, "int_parsing", ("body", "x")),
        (("body", "x", "list[int]"), {"x": "abc"}, "list_type", ("body", "x")),
        (("body", "z", "A", "y"), {"z": {}}, "missing", ("body", "z")),
        (("body", "name"), {}, "missing", ("body", "name")),
        (
            ("body", "items", 1, "id"),
            {"items": [{}, {"id": "q"}]},
            "x",
            ("body", "items", 1, "id"),
        ),
        (("body", "items", 5), {"items": []}, "x", ("body", "items")),
        (("body",), ["not", "a", "dict"], "model_attributes_type", ("body",)),
        (("query", "page"), {"page": 1}, "missing", ("query", "page")),
        ((), None, "x", ()),
    ],
)
def test_trim_union_segments(
    loc: tuple[int | str, ...],
    body: object,
    error_type: str,
    expected: tuple[int | str, ...],
) -> None:
    assert error_handlers._trim_union_segments(loc, body, error_type) == expected


async def test_405_allow_lists_every_method_of_the_path() -> None:
    # TG-629: /api/outings té GET i POST; Starlette només posa el de la primera ruta.
    # Les rutes van en un router inclòs amb prefix, com a l'app (include_router).
    app = FastAPI()
    error_handlers.register_error_handlers(app)
    router = APIRouter(prefix="/things")

    @router.get("")
    async def list_things() -> list[str]:
        return []

    @router.post("")
    async def create_thing() -> str:
        return "ok"

    @router.delete("/{thing_id}")
    async def delete_thing(thing_id: str) -> None:
        return None

    app.include_router(router, prefix="/api")

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        collection = await client.put("/api/things")
        item = await client.get("/api/things/1")

    assert collection.status_code == 405
    assert collection.headers["allow"] == "GET, POST"
    assert item.status_code == 405
    assert item.headers["allow"] == "DELETE"


async def test_405_keeps_its_own_allow_when_no_route_matches() -> None:
    # Un 405 llançat a mà per a un camí sense rutes conserva l'Allow que porta
    request = make_request("/nowhere")
    request.scope["app"] = FastAPI()

    response = await error_handlers._handle_http_exception(
        request, StarletteHTTPException(405, headers={"Allow": "GET"})
    )

    assert response.headers["Allow"] == "GET"
