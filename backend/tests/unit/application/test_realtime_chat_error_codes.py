"""Error codes of the chat over the WebSocket, as frames ``error``. TG-459."""

import pytest

from app.application.realtime import errors
from app.application.realtime.errors import error_frame

# code -> (status, title); statuses are the ones the REST API gives the same codes
NEW_CODES = {
    "CHAT_MESSAGE_EMPTY": (422, "Unprocessable Entity"),
    "CHAT_MESSAGE_TOO_LONG": (422, "Unprocessable Entity"),
    "CHAT_MESSAGE_REJECTED": (422, "Unprocessable Entity"),
    "DATABASE_UNAVAILABLE": (503, "Service Unavailable"),
    "EVENT_NOT_FOUND": (404, "Not Found"),
    "CHAT_ROOM_NOT_FOUND": (404, "Not Found"),
    "INVALID_SESSION": (401, "Unauthorized"),
    "ACCOUNT_SUSPENDED": (403, "Forbidden"),
    "ACCOUNT_DELETED": (403, "Forbidden"),
}


@pytest.mark.parametrize("code", NEW_CODES)
def test_the_new_codes_are_constants_equal_to_their_name(code: str) -> None:
    assert getattr(errors, code) == code


@pytest.mark.parametrize(("code", "expected"), NEW_CODES.items())
def test_the_new_codes_have_a_status_and_a_title(
    code: str, expected: tuple[int, str]
) -> None:
    status, title = expected

    frame = error_frame(code, "detail", correlation_id="c-1")

    assert frame.payload["code"] == code
    assert frame.payload["status"] == status
    assert frame.payload["title"] == title


@pytest.mark.parametrize(
    ("code", "known"),
    [
        ("CHAT_MESSAGE_EMPTY", True),
        ("RATE_LIMITED", True),
        ("PUBSUB_UNAVAILABLE", True),
        ("REDIS_DOWN", False),
        ("SOMETHING_NEW", False),
    ],
)
def test_a_code_is_known_when_it_has_a_status(code: str, known: bool) -> None:
    assert errors.is_known(code) is known
