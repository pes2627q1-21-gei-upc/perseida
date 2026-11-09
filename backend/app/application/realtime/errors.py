from app.domain.realtime.models import Frame, FrameType

VALIDATION_ERROR = "VALIDATION_ERROR"
UNKNOWN_FRAME_TYPE = "UNKNOWN_FRAME_TYPE"
NOT_SUBSCRIBED = "NOT_SUBSCRIBED"
PUBSUB_UNAVAILABLE = "PUBSUB_UNAVAILABLE"
INTERNAL_ERROR = "INTERNAL_ERROR"
FORBIDDEN = "FORBIDDEN"
RATE_LIMITED = "RATE_LIMITED"

CLOSE_GOING_AWAY = 1001
CLOSE_INTERNAL_ERROR = 1011
CLOSE_TRY_AGAIN_LATER = 1013
CLOSE_UNAUTHENTICATED = 4401

_STATUS = {
    VALIDATION_ERROR: 422,
    UNKNOWN_FRAME_TYPE: 422,
    NOT_SUBSCRIBED: 409,
    PUBSUB_UNAVAILABLE: 503,
    INTERNAL_ERROR: 500,
    FORBIDDEN: 403,
    RATE_LIMITED: 429,
}
_TITLE = {
    422: "Unprocessable Entity",
    409: "Conflict",
    503: "Service Unavailable",
    500: "Internal Server Error",
    403: "Forbidden",
    429: "Too Many Requests",
}


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
