import unicodedata
import uuid
from datetime import UTC, datetime

import pytest
from hypothesis import given
from hypothesis import strategies as st
from pydantic import ValidationError as PydanticValidationError

from app.domain.chat.models import ChatMessage, EventChatRoom
from app.domain.shared.errors import ValidationError

ROOM_ID = uuid.uuid7()
AUTHOR_ID = uuid.uuid7()


def _message(text: str) -> ChatMessage:
    return ChatMessage.create(room_id=ROOM_ID, author_id=AUTHOR_ID, text=text)


def test_create_message_keeps_room_author_and_text() -> None:
    # TG-64 criteri 1: un missatge pertany a una sala i a un autor
    message = _message("Quin cel tan clar!")

    assert message.room_id == ROOM_ID
    assert message.author_id == AUTHOR_ID
    assert message.text == "Quin cel tan clar!"


def test_create_message_generates_uuid_v7_id() -> None:
    # TG-64 criteri 1: id UUIDv7 (ADR-0023)
    message = _message("hola")

    assert message.id.version == 7
    assert _message("hola").id != message.id


def test_create_message_sets_sent_at_in_utc() -> None:
    # TG-64 criteri 4: el servidor assigna sent_at
    before = datetime.now(UTC)
    message = _message("hola")
    after = datetime.now(UTC)

    assert message.sent_at.utcoffset() == UTC.utcoffset(None)
    assert before <= message.sent_at <= after


def test_message_text_is_stripped_and_keeps_inner_newlines() -> None:
    # TG-64 criteri 7: es retallen els espais dels extrems
    assert _message("  hola\nmón \n").text == "hola\nmón"


@pytest.mark.parametrize("text", ["", "   ", "\t\n  \r\n", "\x00", " \x00\x07 "])
def test_blank_message_is_rejected(text: str) -> None:
    # TG-64 criteri 7: buit, només espais o només caràcters de control
    with pytest.raises(ValidationError) as exc_info:
        _message(text)

    assert exc_info.value.code == "CHAT_MESSAGE_EMPTY"


def test_message_of_1000_characters_is_accepted() -> None:
    # TG-64 criteri 7: el límit és inclusiu
    assert len(_message("a" * 1000).text) == 1000


def test_message_of_1001_characters_is_rejected() -> None:
    with pytest.raises(ValidationError) as exc_info:
        _message("a" * 1001)

    assert exc_info.value.code == "CHAT_MESSAGE_TOO_LONG"


def test_surrounding_blanks_do_not_count_towards_the_limit() -> None:
    assert len(_message("  " + "a" * 1000 + " \n").text) == 1000


def test_control_characters_are_removed_but_newline_and_tab_stay() -> None:
    # Hardening: PostgreSQL rebutja el NUL; la resta de controls no serveix en un xat
    assert _message("a\x00b\x07c\nd\te").text == "abc\nd\te"


def test_message_is_frozen() -> None:
    message = _message("hola")

    with pytest.raises(PydanticValidationError):
        message.text = "altre"  # type: ignore[misc]


def _expected(text: str) -> str:
    kept = "".join(
        char
        for char in text
        if char in "\n\t" or unicodedata.category(char) not in ("Cc", "Cs", "Co", "Cn")
    )
    return kept.strip()


@given(text=st.text(max_size=1200))
def test_any_text_is_either_cleaned_within_the_limit_or_rejected(text: str) -> None:
    # TG-64 criteri 7 (propietat): mai es desa res buit ni de més de 1000
    expected = _expected(text)
    if not expected:
        with pytest.raises(ValidationError) as exc_info:
            _message(text)
        assert exc_info.value.code == "CHAT_MESSAGE_EMPTY"
    elif len(expected) > 1000:
        with pytest.raises(ValidationError) as exc_info:
            _message(text)
        assert exc_info.value.code == "CHAT_MESSAGE_TOO_LONG"
    else:
        assert _message(text).text == expected


@given(length=st.integers(min_value=0, max_value=1100))
def test_the_limit_is_exactly_1000_characters(length: int) -> None:
    # TG-64 criteri 7 (propietat): al voltant del límit
    text = "a" * length
    if length == 0:
        with pytest.raises(ValidationError):
            _message(text)
    elif length <= 1000:
        assert _message(text).text == text
    else:
        with pytest.raises(ValidationError) as exc_info:
            _message(text)
        assert exc_info.value.code == "CHAT_MESSAGE_TOO_LONG"


def test_create_room_links_the_event() -> None:
    # TG-64 criteri 1: una sala penja d'un esdeveniment
    event_id = uuid.uuid7()

    room = EventChatRoom.create(event_id=event_id)

    assert room.event_id == event_id


def test_create_room_generates_uuid_v7_id_and_utc_created_at() -> None:
    before = datetime.now(UTC)
    room = EventChatRoom.create(event_id=uuid.uuid7())
    after = datetime.now(UTC)

    assert room.id.version == 7
    assert before <= room.created_at <= after
    assert room.created_at.utcoffset() == UTC.utcoffset(None)


def test_room_is_frozen() -> None:
    room = EventChatRoom.create(event_id=uuid.uuid7())

    with pytest.raises(PydanticValidationError):
        room.event_id = uuid.uuid7()  # type: ignore[misc]
