from typing import Any

import pytest
from pydantic import ValidationError

from app.domain.realtime.models import (
    Frame,
    FrameType,
    revocation_channel,
    room_channel,
)

MAX_ROOM_LENGTH = 64


def test_frame_type_values_are_the_wire_contract() -> None:
    assert {t.value for t in FrameType} == {
        "auth",
        "subscribe",
        "unsubscribe",
        "message",
        "error",
        "ping",
        "pong",
    }
    assert len(FrameType) == 7


def test_frame_type_is_a_str_enum() -> None:
    assert FrameType.PING == "ping"
    assert FrameType("pong") is FrameType.PONG


def test_frame_only_requires_type_and_defaults_the_rest() -> None:
    frame = Frame(type=FrameType.PING)

    assert frame.type is FrameType.PING
    assert frame.room is None
    assert frame.payload == {}
    assert frame.id is None


def test_frame_accepts_all_the_fields() -> None:
    frame = Frame(
        type=FrameType.MESSAGE,
        room="chat:1",
        payload={"text": "hola"},
        id="abc",
    )

    assert frame.type is FrameType.MESSAGE
    assert frame.room == "chat:1"
    assert frame.payload == {"text": "hola"}
    assert frame.id == "abc"


def test_frame_default_payload_is_not_shared_between_instances() -> None:
    first = Frame(type=FrameType.PING)
    second = Frame(type=FrameType.PING)

    first.payload["x"] = 1

    assert second.payload == {}
    assert first.payload is not second.payload


def test_frame_is_immutable() -> None:
    frame = Frame(type=FrameType.PING)

    with pytest.raises(ValidationError):
        frame.room = "chat:1"  # type: ignore[misc]


def test_frame_rejects_an_unknown_type() -> None:
    with pytest.raises(ValidationError):
        Frame.model_validate({"type": "teleport"})


def test_frame_rejects_a_missing_type() -> None:
    with pytest.raises(ValidationError):
        Frame.model_validate({"room": "chat:1"})


def test_frame_rejects_extra_fields() -> None:
    with pytest.raises(ValidationError):
        Frame.model_validate({"type": "ping", "unexpected": 1})


@pytest.mark.parametrize("payload", ["text", 1, ["a"], None])
def test_frame_rejects_a_payload_that_is_not_an_object(payload: Any) -> None:
    with pytest.raises(ValidationError):
        Frame.model_validate({"type": "message", "payload": payload})


@pytest.mark.parametrize("raw", ["not json", "", "[1, 2]", '{"type": "ping"'])
def test_frame_model_validate_json_rejects_invalid_json(raw: str) -> None:
    with pytest.raises(ValidationError):
        Frame.model_validate_json(raw)


def test_frame_model_validate_json_parses_a_valid_frame() -> None:
    frame = Frame.model_validate_json(
        '{"type": "subscribe", "room": "chat:1", "id": "7"}'
    )

    assert frame == Frame(type=FrameType.SUBSCRIBE, room="chat:1", id="7")


@pytest.mark.parametrize(
    "room",
    [
        "a",
        "chat",
        "chat:1",
        "chat:1:sub",
        "a_b-c",
        "0123",
        "session-revoked:x",
    ],
)
def test_frame_accepts_valid_room_names(room: str) -> None:
    assert Frame(type=FrameType.SUBSCRIBE, room=room).room == room


@pytest.mark.parametrize(
    "room",
    [
        "",
        "Chat",
        "chat:A",
        "chat 1",
        "chat:",
        ":chat",
        "chat::1",
        "chat/1",
        "chat.1",
        "chat\n",
        "xat:ç",
    ],
)
def test_frame_rejects_invalid_room_names(room: str) -> None:
    with pytest.raises(ValidationError):
        Frame(type=FrameType.SUBSCRIBE, room=room)


def test_frame_room_of_64_characters_is_valid() -> None:
    room = "a" * MAX_ROOM_LENGTH

    assert Frame(type=FrameType.SUBSCRIBE, room=room).room == room


def test_frame_room_of_65_characters_is_invalid() -> None:
    with pytest.raises(ValidationError):
        Frame(type=FrameType.SUBSCRIBE, room="a" * (MAX_ROOM_LENGTH + 1))


def test_frame_room_with_separators_of_64_characters_is_valid() -> None:
    room = "a" * 31 + ":" + "b" * 32

    assert len(room) == MAX_ROOM_LENGTH
    assert Frame(type=FrameType.SUBSCRIBE, room=room).room == room


def test_room_channel_prefixes_the_room() -> None:
    assert room_channel("chat:1") == "room:chat:1"
    assert room_channel("a") == "room:a"


def test_revocation_channel_prefixes_the_google_sub() -> None:
    assert revocation_channel("google-123") == "session-revoked:google-123"


def test_a_room_can_never_produce_a_revocation_channel() -> None:
    for room in ("session-revoked:google-123", "session-revoked", "x"):
        channel = room_channel(room)

        assert channel.startswith("room:")
        assert not channel.startswith("session-revoked:")
    assert room_channel("session-revoked:x") == "room:session-revoked:x"
    assert room_channel("session-revoked:x") != revocation_channel("x")


def test_frame_serialises_without_none_fields() -> None:
    frame = Frame(type=FrameType.PING)

    assert frame.model_dump_json(exclude_none=True) == '{"type":"ping","payload":{}}'


def test_frame_round_trips_through_json_without_none_fields() -> None:
    frame = Frame(
        type=FrameType.MESSAGE, room="chat:1", payload={"text": "hola"}, id="9"
    )

    restored = Frame.model_validate_json(frame.model_dump_json(exclude_none=True))

    assert restored == frame


def test_frame_without_optionals_round_trips_through_json() -> None:
    frame = Frame(type=FrameType.PONG)

    restored = Frame.model_validate_json(frame.model_dump_json(exclude_none=True))

    assert restored == frame
