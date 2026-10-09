import re
import uuid
from contextvars import ContextVar

from starlette.datastructures import Headers, MutableHeaders
from starlette.requests import Request
from starlette.types import ASGIApp, Message, Receive, Scope, Send

CORRELATION_HEADER = "X-Correlation-ID"
_VALID_ID = re.compile(r"[A-Za-z0-9._-]{1,128}")

correlation_id_var: ContextVar[str | None] = ContextVar("correlation_id", default=None)


def get_correlation_id(request: Request) -> str | None:
    """Return the correlation id bound to the request, if any."""
    value = getattr(request.state, "correlation_id", None)
    if isinstance(value, str):
        return value
    return correlation_id_var.get()


class CorrelationIdMiddleware:
    """Pure ASGI middleware that propagates ``X-Correlation-ID``."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return

        incoming = Headers(scope=scope).get(CORRELATION_HEADER)
        correlation_id = (
            incoming
            if incoming and _VALID_ID.fullmatch(incoming)
            else str(uuid.uuid4())
        )
        scope.setdefault("state", {})["correlation_id"] = correlation_id
        token = correlation_id_var.set(correlation_id)

        async def send_with_header(message: Message) -> None:
            if message["type"] == "http.response.start":
                MutableHeaders(scope=message)[CORRELATION_HEADER] = correlation_id
            await send(message)

        try:
            await self.app(scope, receive, send_with_header)
        finally:
            correlation_id_var.reset(token)
