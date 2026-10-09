"""RFC 9457 error handlers and correlation id. TG-304 (US TG-44).

Derived from the task's "Fet quan": every error class maps to its status with
``application/problem+json``, the 500 never leaks internals and every response
carries ``X-Correlation-ID``.
"""

import uuid
from collections.abc import AsyncIterator
from http import HTTPStatus
from typing import Any

import pytest
from fastapi import APIRouter, FastAPI
from httpx import ASGITransport, AsyncClient, Response
from starlette.exceptions import HTTPException as StarletteHTTPException

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
from app.main import create_app

PROBLEM = "application/problem+json"
HEADER = "X-Correlation-ID"

ERROR_CASES: list[tuple[str, type[Exception], int]] = [
    ("not-found", NotFoundError, 404),
    ("conflict", ConflictError, 409),
    ("validation", ValidationError, 422),
    ("business-rule", BusinessRuleViolation, 422),
    ("unauthorized", UnauthorizedError, 401),
    ("forbidden", ForbiddenError, 403),
    ("external", ExternalServiceError, 503),
    ("domain-base", DomainError, 400),
    ("application-base", ApplicationError, 400),
]


def _build_router() -> APIRouter:
    router = APIRouter(prefix="/_test")

    def make(cls: type[Exception]) -> Any:
        async def endpoint() -> None:
            raise cls("SOME_CODE", "Some message")

        return endpoint

    for path, cls, _ in ERROR_CASES:
        router.add_api_route(f"/{path}", make(cls), methods=["GET"])

    @router.post("/items")
    async def create_item(name: str, body: dict[str, Any]) -> None:
        return None

    @router.get("/crash")
    async def crash() -> None:
        raise RuntimeError("secret")

    @router.get("/teapot")
    async def teapot() -> None:
        raise StarletteHTTPException(418, detail="short and stout")

    @router.get("/unknown-status")
    async def unknown_status() -> None:
        raise StarletteHTTPException(599)

    @router.get("/forbidden-http")
    async def forbidden_http() -> None:
        raise StarletteHTTPException(403, detail="nope", headers={"X-Extra": "1"})

    @router.get("/ok")
    async def ok() -> dict[str, str]:
        return {"status": "ok"}

    return router


@pytest.fixture
def app() -> FastAPI:
    app = create_app()
    app.include_router(_build_router())
    return app


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(
        transport=ASGITransport(app=app, raise_app_exceptions=False),
        base_url="http://test",
    ) as http:
        yield http


def assert_problem(
    response: Response, status: int, code: str, path: str
) -> dict[str, Any]:
    assert response.status_code == status
    assert response.headers["content-type"] == PROBLEM
    body: dict[str, Any] = response.json()
    assert body["type"] == "about:blank"
    assert body["title"] == HTTPStatus(status).phrase
    assert body["status"] == status
    assert body["code"] == code
    assert body["instance"] == path
    assert isinstance(body["detail"], str)
    assert body["correlation_id"] == response.headers[HEADER]
    return body


@pytest.mark.parametrize(("path", "cls", "status"), ERROR_CASES)
async def test_each_error_class_maps_to_problem_json(
    client: AsyncClient, path: str, cls: type[Exception], status: int
) -> None:
    response = await client.get(f"/_test/{path}")

    body = assert_problem(response, status, "SOME_CODE", f"/_test/{path}")
    assert body["detail"] == "Some message"
    assert "errors" not in body


async def test_domain_error_without_message_uses_code_as_detail(
    app: FastAPI, client: AsyncClient
) -> None:
    @app.get("/_test/no-message")
    async def no_message() -> None:
        raise NotFoundError("EVENT_NOT_FOUND")

    response = await client.get("/_test/no-message")

    body = assert_problem(response, 404, "EVENT_NOT_FOUND", "/_test/no-message")
    assert body["detail"] == "EVENT_NOT_FOUND"


async def test_body_validation_error_lists_fields_without_prefix(
    client: AsyncClient,
) -> None:
    response = await client.post("/_test/items", json=["not", "a", "dict"])

    body = assert_problem(response, 422, "VALIDATION_ERROR", "/_test/items")
    fields = {error["field"] for error in body["errors"]}
    assert "name" in fields
    assert all(not f.startswith(("body", "query")) for f in fields)
    for error in body["errors"]:
        assert set(error) == {"field", "message", "type"}
        assert all(isinstance(v, str) for v in error.values())


async def test_missing_query_param_reports_field_and_type(
    client: AsyncClient,
) -> None:
    response = await client.post("/_test/items", json={})

    body = assert_problem(response, 422, "VALIDATION_ERROR", "/_test/items")
    assert body["errors"] == [
        {"field": "name", "message": "Field required", "type": "missing"}
    ]


async def test_unknown_route_is_not_found_problem(client: AsyncClient) -> None:
    response = await client.get("/api/does-not-exist")

    body = assert_problem(response, 404, "NOT_FOUND", "/api/does-not-exist")
    assert body["detail"] == "Not Found"


async def test_wrong_method_is_405_and_keeps_allow_header(
    client: AsyncClient,
) -> None:
    response = await client.post("/api/health")

    assert_problem(response, 405, "METHOD_NOT_ALLOWED", "/api/health")
    assert "GET" in response.headers["allow"]


async def test_http_exception_with_other_status_uses_generic_code(
    client: AsyncClient,
) -> None:
    response = await client.get("/_test/teapot")

    body = assert_problem(response, 418, "HTTP_418", "/_test/teapot")
    assert body["detail"] == "short and stout"


async def test_http_exception_without_known_phrase_falls_back(
    client: AsyncClient,
) -> None:
    response = await client.get("/_test/unknown-status")

    assert response.status_code == 599
    assert response.headers["content-type"] == PROBLEM
    body = response.json()
    assert body["code"] == "HTTP_599"
    assert body["detail"] == "HTTP error"


async def test_http_exception_headers_are_preserved(client: AsyncClient) -> None:
    response = await client.get("/_test/forbidden-http")

    assert_problem(response, 403, "HTTP_403", "/_test/forbidden-http")
    assert response.headers["x-extra"] == "1"


async def test_unexpected_exception_returns_500_without_leaking(
    client: AsyncClient, caplog: pytest.LogCaptureFixture
) -> None:
    response = await client.get("/_test/crash")

    body = assert_problem(response, 500, "INTERNAL_ERROR", "/_test/crash")
    assert body["detail"] == "Unexpected error"
    for leaked in ("RuntimeError", "secret", "Traceback"):
        assert leaked not in response.text
    # The detail is logged server side with the correlation id.
    record = next(r for r in caplog.records if r.message == "Unhandled exception")
    assert record.correlation_id == body["correlation_id"]  # type: ignore[attr-defined]


async def test_handled_error_is_logged_with_code_status_and_route(
    client: AsyncClient, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level("INFO")

    response = await client.get("/_test/not-found")

    body = response.json()
    record = next(r for r in caplog.records if r.message == "Handled error")
    assert record.correlation_id == body["correlation_id"]  # type: ignore[attr-defined]
    assert record.code == body["code"]  # type: ignore[attr-defined]
    assert record.status == 404  # type: ignore[attr-defined]
    assert record.route == "/_test/not-found"  # type: ignore[attr-defined]


# --- Correlation id -------------------------------------------------------


async def test_correlation_id_generated_on_success(client: AsyncClient) -> None:
    response = await client.get("/_test/ok")

    assert uuid.UUID(response.headers[HEADER]).version == 4


async def test_correlation_id_generated_on_error(client: AsyncClient) -> None:
    response = await client.get("/_test/not-found")

    assert uuid.UUID(response.headers[HEADER]).version == 4
    assert response.json()["correlation_id"] == response.headers[HEADER]


async def test_generated_ids_differ_between_requests(client: AsyncClient) -> None:
    first = await client.get("/_test/ok")
    second = await client.get("/_test/ok")

    assert first.headers[HEADER] != second.headers[HEADER]


@pytest.mark.parametrize("path", ["/_test/ok", "/_test/not-found", "/_test/crash"])
async def test_valid_incoming_correlation_id_is_respected(
    client: AsyncClient, path: str
) -> None:
    response = await client.get(path, headers={HEADER: "trace-123._abc"})

    assert response.headers[HEADER] == "trace-123._abc"
    if response.status_code >= 400:
        assert response.json()["correlation_id"] == "trace-123._abc"


@pytest.mark.parametrize(
    "incoming",
    ["x" * 129, "bad id with spaces", "semi;colon", "a/b", "café"],
)
async def test_invalid_incoming_correlation_id_is_replaced(
    client: AsyncClient, incoming: str
) -> None:
    response = await client.get(
        "/_test/not-found",
        headers=[(HEADER.lower().encode(), incoming.encode("utf-8"))],
    )

    assert response.headers[HEADER] != incoming
    assert uuid.UUID(response.headers[HEADER]).version == 4
    assert response.json()["correlation_id"] == response.headers[HEADER]


async def test_max_length_incoming_correlation_id_is_accepted(
    client: AsyncClient,
) -> None:
    value = "a" * 128

    response = await client.get("/_test/ok", headers={HEADER: value})

    assert response.headers[HEADER] == value


async def test_correlation_id_on_unknown_route(client: AsyncClient) -> None:
    response = await client.get("/nope", headers={HEADER: "keep-me"})

    assert response.headers[HEADER] == "keep-me"
    assert response.json()["correlation_id"] == "keep-me"
