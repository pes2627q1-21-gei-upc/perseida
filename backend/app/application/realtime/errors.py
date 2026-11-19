from app.application.shared.error_codes import (
    ACCOUNT_DELETED,
    ACCOUNT_SUSPENDED,
    DATABASE_UNAVAILABLE,
    INVALID_SESSION,
)

# Re-exported for the chat and the session; it lives in application.shared.
from app.application.shared.error_codes import RATE_LIMITED as RATE_LIMITED
from app.domain.realtime.models import Frame, FrameType

VALIDATION_ERROR = "VALIDATION_ERROR"
UNKNOWN_FRAME_TYPE = "UNKNOWN_FRAME_TYPE"
NOT_SUBSCRIBED = "NOT_SUBSCRIBED"
PUBSUB_UNAVAILABLE = "PUBSUB_UNAVAILABLE"
INTERNAL_ERROR = "INTERNAL_ERROR"
FORBIDDEN = "FORBIDDEN"
# Codes of the room handlers (chat, TG-459); they travel unchanged, as in REST.
CHAT_MESSAGE_EMPTY = "CHAT_MESSAGE_EMPTY"
CHAT_MESSAGE_TOO_LONG = "CHAT_MESSAGE_TOO_LONG"
CHAT_MESSAGE_REJECTED = "CHAT_MESSAGE_REJECTED"
CHAT_ROOM_NOT_FOUND = "CHAT_ROOM_NOT_FOUND"
EVENT_NOT_FOUND = "EVENT_NOT_FOUND"
# DATABASE_UNAVAILABLE, INVALID_SESSION, RATE_LIMITED and ACCOUNT_* are shared with REST
# (application.shared.error_codes) and imported above.

CLOSE_GOING_AWAY = 1001
CLOSE_INTERNAL_ERROR = 1011
CLOSE_TRY_AGAIN_LATER = 1013
CLOSE_UNAUTHENTICATED = 4401
CLOSE_TOO_MANY_CONNECTIONS = 4429

_STATUS = {
    VALIDATION_ERROR: 422,
    UNKNOWN_FRAME_TYPE: 422,
    NOT_SUBSCRIBED: 409,
    PUBSUB_UNAVAILABLE: 503,
    INTERNAL_ERROR: 500,
    FORBIDDEN: 403,
    RATE_LIMITED: 429,
    CHAT_MESSAGE_EMPTY: 422,
    CHAT_MESSAGE_TOO_LONG: 422,
    CHAT_MESSAGE_REJECTED: 422,
    CHAT_ROOM_NOT_FOUND: 404,
    EVENT_NOT_FOUND: 404,
    DATABASE_UNAVAILABLE: 503,
    INVALID_SESSION: 401,
    ACCOUNT_SUSPENDED: 403,
    ACCOUNT_DELETED: 403,
}
_TITLE = {
    422: "Unprocessable Entity",
    409: "Conflict",
    503: "Service Unavailable",
    500: "Internal Server Error",
    403: "Forbidden",
    429: "Too Many Requests",
    404: "Not Found",
    401: "Unauthorized",
}


def is_known(code: str) -> bool:
    """Whether ``code`` is one the real-time layer can put in an error frame."""
    return code in _STATUS


def title_of(code: str) -> str:
    """Generic text of a known ``code`` (its HTTP title), safe to show as detail."""
    return _TITLE[_STATUS[code]]


def error_frame(
    code: str,
    detail: str,
    *,
    correlation_id: str,
    frame_id: str | None = None,
    room: str | None = None,
) -> Frame:
    """Error frame whose payload is an RFC 9457 problem with a stable ``code``.

    ``correlation_id`` identifies the connection in the logs (ADR-0018).
    """
    status = _STATUS[code]
    return Frame(
        type=FrameType.ERROR,
        room=room,
        id=frame_id,
        payload={
            "type": "about:blank",
            "title": _TITLE[status],
            "status": status,
            "detail": detail,
            "code": code,
            "correlation_id": correlation_id,
        },
    )
