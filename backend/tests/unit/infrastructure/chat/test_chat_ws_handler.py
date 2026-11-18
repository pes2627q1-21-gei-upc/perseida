"""ChatWsHandler: the chat rooms of the WebSocket over ChatService. TG-459."""

import json
import uuid
from typing import Any

import pytest
from app.application.realtime.room_handler import RoomHandler, RoomRequest
from app.infrastructure.chat.ws_handler import CHAT_ROOM_PREFIX, ChatWsHandler

from app.application.chat.chat_service import ChatService
from app.application.shared.errors import ExternalServiceError, ForbiddenError
from app.domain.shared.errors import NotFoundError, ValidationError
from tests.fakes.chat import ChatFakes


@pytest.fixture
def env() -> ChatFakes:
    return ChatFakes()


@pytest.fixture
def handler(env: ChatFakes) -> ChatWsHandler:
    return ChatWsHandler(ChatService(env, env, env, env, env))


def request(env: ChatFakes, room: str | None = None, conn: str = "c-1") -> RoomRequest:
    return RoomRequest(
        sub=str(env.user), conn_id=conn, room=room or f"{CHAT_ROOM_PREFIX}{env.event}"
    )


def test_the_prefix_of_the_chat_rooms() -> None:
    assert CHAT_ROOM_PREFIX == "chat:event:"


def test_it_is_a_room_handler(handler: ChatWsHandler) -> None:
    candidate: RoomHandler = handler

    assert candidate is handler


# --- subscribe / unsubscribe ---------------------------------------------------


async def test_subscribing_checks_the_subscription_to_the_event(
    handler: ChatWsHandler, env: ChatFakes
) -> None:
    await handler.subscribe(request(env))

    assert env.calls[:2] == ["event", "subscription"]
    assert env.messages == []  # nothing is sent by subscribing


async def test_subscribing_without_a_subscription_to_the_event_is_forbidden(
    handler: ChatWsHandler, env: ChatFakes
) -> None:
    env.subscribed = False

    with pytest.raises(ForbiddenError) as exc:
        await handler.subscribe(request(env))

    assert exc.value.code == "FORBIDDEN"


async def test_subscribing_to_an_unknown_event_is_event_not_found(
    handler: ChatWsHandler, env: ChatFakes
) -> None:
    env.missing = True

    with pytest.raises(NotFoundError) as exc:
        await handler.subscribe(request(env))

    assert exc.value.code == "EVENT_NOT_FOUND"


async def test_another_user_is_forbidden(
    handler: ChatWsHandler, env: ChatFakes
) -> None:
    other = RoomRequest(
        sub=str(uuid.uuid7()), conn_id="c", room=f"{CHAT_ROOM_PREFIX}{env.event}"
    )

    with pytest.raises(ForbiddenError):
        await handler.subscribe(other)


@pytest.mark.parametrize(
    "suffix",
    [
        "",
        "not-a-uuid",
        "123",
        uuid.UUID(int=1).hex,  # a valid UUID, but not in the canonical form
        str(uuid.UUID(int=1)) + "-x",
    ],
    ids=["empty", "text", "number", "no-hyphens", "trailing"],
)
@pytest.mark.parametrize("action", ["subscribe", "unsubscribe", "message"])
async def test_a_malformed_event_id_in_the_room_is_a_validation_error(
    handler: ChatWsHandler, env: ChatFakes, action: str, suffix: str
) -> None:
    bad = RoomRequest(
        sub=str(env.user), conn_id="c", room=f"{CHAT_ROOM_PREFIX}{suffix}"
    )
    call = (
        handler.message(bad, {"text": "hola"})
        if action == "message"
        else getattr(handler, action)(bad)
    )

    with pytest.raises(ValidationError) as exc:
        await call

    assert exc.value.code == "VALIDATION_ERROR"
    assert env.calls == []  # nothing was asked to the service


async def test_a_sub_that_is_not_a_user_id_is_forbidden(
    handler: ChatWsHandler, env: ChatFakes
) -> None:
    bad = RoomRequest(
        sub="google-123", conn_id="c", room=f"{CHAT_ROOM_PREFIX}{env.event}"
    )

    with pytest.raises(ForbiddenError):
        await handler.subscribe(bad)
    assert env.calls == []


async def test_unsubscribing_needs_no_permission_and_touches_nothing(
    handler: ChatWsHandler, env: ChatFakes
) -> None:
    env.subscribed = False

    await handler.unsubscribe(request(env))

    assert env.calls == []


# --- message -------------------------------------------------------------------


async def test_a_message_is_sent_with_the_connection_as_origin(
    handler: ChatWsHandler, env: ChatFakes
) -> None:
    ack = await handler.message(request(env, conn="conn-5"), {"text": " hola "})

    [stored] = env.messages
    assert stored.text == "hola"
    assert stored.author_id == env.user
    envelope = json.loads(env.published[0])
    assert envelope["from"] == "conn-5"
    assert envelope["frame"]["payload"] == stored.model_dump(mode="json")
    assert env.channels == [f"room:{CHAT_ROOM_PREFIX}{env.event}"]
    assert ack  # see the next test for its content


async def test_the_ack_is_the_id_and_the_timestamp_of_the_stored_message(
    handler: ChatWsHandler, env: ChatFakes
) -> None:
    ack = await handler.message(request(env), {"text": "hola"})

    dto = json.loads(env.published[0])["frame"]["payload"]
    assert ack == {"id": dto["id"], "sent_at": dto["sent_at"]}


@pytest.mark.parametrize(
    "payload",
    [{}, {"text": 5}, {"text": None}, {"text": ["hola"]}, {"body": "hola"}],
    ids=["empty", "number", "null", "list", "other-key"],
)
async def test_a_payload_without_a_text_string_is_a_validation_error(
    handler: ChatWsHandler, env: ChatFakes, payload: dict[str, Any]
) -> None:
    with pytest.raises(ValidationError) as exc:
        await handler.message(request(env), payload)

    assert exc.value.code == "VALIDATION_ERROR"
    assert env.calls == []


@pytest.mark.parametrize(
    ("text", "code"),
    [
        ("", "CHAT_MESSAGE_EMPTY"),
        (" \n", "CHAT_MESSAGE_EMPTY"),
        ("x" * 1001, "CHAT_MESSAGE_TOO_LONG"),
    ],
)
async def test_the_errors_of_the_service_go_through_unchanged(
    handler: ChatWsHandler, env: ChatFakes, text: str, code: str
) -> None:
    with pytest.raises(ValidationError) as exc:
        await handler.message(request(env), {"text": text})

    assert exc.value.code == code
    assert env.published == []


async def test_a_message_of_a_user_not_subscribed_is_forbidden(
    handler: ChatWsHandler, env: ChatFakes
) -> None:
    env.subscribed = False

    with pytest.raises(ForbiddenError):
        await handler.message(request(env), {"text": "hola"})

    assert env.messages == []


async def test_an_unavailable_database_is_not_hidden(
    handler: ChatWsHandler, env: ChatFakes
) -> None:
    env.fail_save = True

    with pytest.raises(ExternalServiceError) as exc:
        await handler.message(request(env), {"text": "hola"})

    assert exc.value.code == "DATABASE_UNAVAILABLE"
    assert env.published == []


async def test_a_pubsub_failure_is_pubsub_unavailable_and_the_message_is_kept(
    handler: ChatWsHandler, env: ChatFakes
) -> None:
    env.fail_publish = True

    with pytest.raises(ExternalServiceError) as exc:
        await handler.message(request(env), {"text": "hola"})

    assert exc.value.code == "PUBSUB_UNAVAILABLE"
    assert len(env.messages) == 1
