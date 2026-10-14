import logging
from http import HTTPStatus

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
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
from app.infrastructure.api.correlation import get_correlation_id
from app.infrastructure.api.problem import problem_response, status_phrase

logger = logging.getLogger(__name__)

STATUS_BY_ERROR: dict[type[Exception], int] = {
    NotFoundError: HTTPStatus.NOT_FOUND,
    ConflictError: HTTPStatus.CONFLICT,
    ValidationError: HTTPStatus.UNPROCESSABLE_ENTITY,
    BusinessRuleViolation: HTTPStatus.UNPROCESSABLE_ENTITY,
    UnauthorizedError: HTTPStatus.UNAUTHORIZED,
    ForbiddenError: HTTPStatus.FORBIDDEN,
    ExternalServiceError: HTTPStatus.SERVICE_UNAVAILABLE,
    DomainError: HTTPStatus.BAD_REQUEST,
    ApplicationError: HTTPStatus.BAD_REQUEST,
}

_LOCATION_PREFIXES = {"body", "query", "path", "header", "cookie"}
_CODE_BY_HTTP_STATUS: dict[int, str] = {
    HTTPStatus.NOT_FOUND.value: "NOT_FOUND",
    HTTPStatus.METHOD_NOT_ALLOWED.value: "METHOD_NOT_ALLOWED",
}


def resolve_status(exc: Exception) -> int:
    """Resolve the HTTP status of an error by walking its MRO."""
    for cls in type(exc).__mro__:
        if cls in STATUS_BY_ERROR:
            return int(STATUS_BY_ERROR[cls])
    return int(HTTPStatus.BAD_REQUEST)


_ABSENT = object()


def _child(container: object, segment: int | str) -> object:
    if isinstance(container, dict):
        return container.get(segment, _ABSENT)
    if isinstance(container, list) and isinstance(segment, int):
        return container[segment] if 0 <= segment < len(container) else _ABSENT
    return _ABSENT


def _trim_union_segments(
    loc: tuple[int | str, ...], body: object, error_type: str
) -> tuple[int | str, ...]:
    """Drop trailing loc segments that are not part of the request body.

    Pydantic appends the union branch (``int``, ``list[int]``, a model name) to
    the loc; those segments are not keys of the input, so they are cut. A key
    that is absent on purpose (``missing``) is kept when it is the last segment.
    """
    if not loc or loc[0] != "body":
        return loc
    kept: list[int | str] = [loc[0]]
    current = body
    for index, segment in enumerate(loc[1:], start=1):
        child = _child(current, segment)
        if child is not _ABSENT:
            current = child
        elif (
            error_type == "missing"
            and index == len(loc) - 1
            and isinstance(current, dict)
        ):
            kept.append(segment)
            break
        else:
            break
        kept.append(segment)
    return tuple(kept)


def _field_name(loc: tuple[int | str, ...]) -> str:
    parts = list(loc)
    if parts and parts[0] in _LOCATION_PREFIXES:
        parts = parts[1:]
    return ".".join(str(part) for part in parts)


async def _handle_domain_or_application_error(
    request: Request, exc: Exception
) -> Response:
    if not isinstance(exc, DomainError | ApplicationError):
        raise exc
    status = resolve_status(exc)
    log = logger.warning if status >= HTTPStatus.INTERNAL_SERVER_ERROR else logger.info
    log(
        "Handled error",
        extra={
            "correlation_id": get_correlation_id(request),
            "code": exc.code,
            "status": status,
            "route": request.url.path,
        },
    )
    return problem_response(request, status, exc.code, exc.message)


async def _handle_validation_error(request: Request, exc: Exception) -> Response:
    if not isinstance(exc, RequestValidationError):
        raise exc
    errors_by_field: dict[str, dict[str, str]] = {}
    for error in exc.errors():
        loc = _trim_union_segments(error["loc"], exc.body, str(error["type"]))
        field = _field_name(loc)
        errors_by_field.setdefault(
            field,
            {"field": field, "message": str(error["msg"]), "type": str(error["type"])},
        )
    errors = list(errors_by_field.values())
    return problem_response(
        request,
        HTTPStatus.UNPROCESSABLE_ENTITY,
        "VALIDATION_ERROR",
        "Request validation failed",
        errors=errors,
    )


async def _handle_http_exception(request: Request, exc: Exception) -> Response:
    if not isinstance(exc, StarletteHTTPException):
        raise exc
    code = _CODE_BY_HTTP_STATUS.get(exc.status_code, f"HTTP_{exc.status_code}")
    return problem_response(
        request,
        exc.status_code,
        code,
        str(exc.detail) if exc.detail else status_phrase(exc.status_code),
        headers=dict(exc.headers) if exc.headers else None,
    )


async def _handle_unexpected_error(request: Request, exc: Exception) -> Response:
    logger.exception(
        "Unhandled exception",
        extra={"correlation_id": get_correlation_id(request)},
    )
    return problem_response(
        request,
        HTTPStatus.INTERNAL_SERVER_ERROR,
        "INTERNAL_ERROR",
        "Unexpected error",
    )


def register_error_handlers(app: FastAPI) -> None:
    """Register all RFC 9457 exception handlers on the app."""
    app.add_exception_handler(DomainError, _handle_domain_or_application_error)
    app.add_exception_handler(ApplicationError, _handle_domain_or_application_error)
    app.add_exception_handler(RequestValidationError, _handle_validation_error)
    app.add_exception_handler(StarletteHTTPException, _handle_http_exception)
    app.add_exception_handler(Exception, _handle_unexpected_error)
