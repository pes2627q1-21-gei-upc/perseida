"""Error frames and stable codes of the real-time layer. TG-63 / US #63."""

import json

import pytest

from app.application.realtime import errors
from app.application.realtime.errors import error_frame
from app.domain.realtime.models import FrameType

STATUS = {
    errors.VALIDATION_ERROR: 422,
    errors.UNKNOWN_FRAME_TYPE: 422,
    errors.NOT_SUBSCRIBED: 409,
    errors.PUBSUB_UNAVAILABLE: 503,
    errors.INTERNAL_ERROR: 500,
    errors.FORBIDDEN: 403,
    errors.RATE_LIMITED: 429,
}
TITLE = {
    422: "Unprocessable Entity",
    409: "Conflict",
    503: "Service Unavailable",
    500: "Internal Server Error",
    403: "Forbidden",
    429: "Too Many Requests",
}


def test_error_codes_are_their_own_name() -> None:
    for code in STATUS:
        assert getattr(errors, code) == code


def test_close_codes_are_the_agreed_ones() -> None:
    assert errors.CLOSE_GOING_AWAY == 1001
    assert errors.CLOSE_INTERNAL_ERROR == 1011
    assert errors.CLOSE_TRY_AGAIN_LATER == 1013
    assert errors.CLOSE_UNAUTHENTICATED == 4401
    assert errors.CLOSE_TOO_MANY_CONNECTIONS == 4429


@pytest.mark.parametrize(("code", "status"), STATUS.items())
def test_error_frame_carries_a_problem_json_payload(code: str, status: int) -> None:
    frame = error_frame(code, "something is wrong", correlation_id="c-1")

    assert frame.type == FrameType.ERROR
    assert frame.payload == {
        "type": "about:blank",
        "title": TITLE[status],
        "status": status,
        "detail": "something is wrong",
        "code": code,
        "correlation_id": "c-1",
    }


def test_error_frame_echoes_the_frame_id_and_the_room() -> None:
    frame = error_frame(
        errors.NOT_SUBSCRIBED,
        "no",
        correlation_id="c-1",
        frame_id="f-1",
        room="sala-a",
    )

    assert frame.id == "f-1"
    assert frame.room == "sala-a"


def test_error_frame_without_id_or_room_leaves_them_empty() -> None:
    frame = error_frame(errors.VALIDATION_ERROR, "bad", correlation_id="c-1")

    assert frame.id is None
    assert frame.room is None


def test_error_frame_serializes_to_json() -> None:
    frame = error_frame(errors.INTERNAL_ERROR, "Internal error.", correlation_id="c-1")

    decoded = json.loads(frame.model_dump_json(exclude_none=True))

    assert decoded["type"] == "error"
    assert decoded["payload"]["code"] == "INTERNAL_ERROR"
    assert decoded["payload"]["status"] == 500


def test_error_frame_does_not_leak_anything_beyond_the_given_detail() -> None:
    frame = error_frame(errors.INTERNAL_ERROR, "Internal error.", correlation_id="c-1")

    assert set(frame.payload) == {
        "type",
        "title",
        "status",
        "detail",
        "code",
        "correlation_id",
    }
    assert "Traceback" not in json.dumps(frame.payload)
