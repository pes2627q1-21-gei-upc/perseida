"""ChatWsHandler: the chat rooms of the WebSocket over ChatService. TG-459."""

import json
import uuid
from datetime import UTC, datetime
from typing import Any

import pytest

from app.application.chat.chat_service import ChatService
from app.application.realtime.room_handler import RoomHandler, RoomRequest
from app.application.shared.errors import (
    ExternalServiceError,
    ForbiddenError,
    UnauthorizedError,
)
from app.application.users.user_service import UserService
from app.domain.shared.account import AccountStatus
from app.domain.shared.errors import ConflictError, NotFoundError, ValidationError
from app.domain.users.models import User
from app.infrastructure.chat.ws_handler import CHAT_ROOM_PREFIX, ChatWsHandler
from tests.fakes.chat import ChatFakes
from tests.fakes.users import InMemoryUserRepository

SUB = "google-sub-1"


@pytest.fixture
def env() -> ChatFakes:
    return ChatFakes()


@pytest.fixture
def accounts(env: ChatFakes) -> InMemoryUserRepository:
    return InMemoryUserRepository(account(env.user, SUB))


@pytest.fixture
def handler(env: ChatFakes, accounts: InMemoryUserRepository) -> ChatWsHandler:
    service = ChatService(env, env, env, env, env)
    users = UserService(accounts)
    return ChatWsHandler(lambda: service, lambda: users)


def account(
    user_id: uuid.UUID, sub: str, status: AccountStatus = AccountStatus.ACTIVE
) -> User:
    now = datetime.now(UTC)
    return User(
        id=user_id,
        google_sub=sub,
        email=f"{sub}@example.com",
        # a deleted account keeps its status; ``deleted_at`` is what marks it
        status=AccountStatus.ACTIVE if status == AccountStatus.DELETED else status,
        created_at=now,
        last_login_at=now,
        deleted_at=now if status == AccountStatus.DELETED else None,
    )


def _payload(text: str, key: uuid.UUID | None = None) -> dict[str, Any]:
    """A valid ``message`` payload: the text and the id the client made up."""
    return {"text": text, "client_message_id": str(key or uuid.uuid4())}


def request(env: ChatFakes, room: str | None = None, conn: str = "c-1") -> RoomRequest:
    # ``sub`` of a session is the Google subject, not the id of the user
    return RoomRequest(
        sub=SUB, conn_id=conn, room=room or f"{CHAT_ROOM_PREFIX}{env.event}"
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
    handler: ChatWsHandler, env: ChatFakes, accounts: InMemoryUserRepository
) -> None:
    accounts.users["other"] = account(uuid.uuid7(), "other")
    other = RoomRequest(sub="other", conn_id="c", room=f"{CHAT_ROOM_PREFIX}{env.event}")

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
        handler.message(bad, _payload("hola"))
        if action == "message"
        else getattr(handler, action)(bad)
    )

    with pytest.raises(ValidationError) as exc:
        await call

    assert exc.value.code == "VALIDATION_ERROR"
    assert env.calls == []  # nothing was asked to the service


@pytest.mark.parametrize("action", ["subscribe", "message"])
async def test_a_session_without_an_account_is_an_invalid_session(
    handler: ChatWsHandler, env: ChatFakes, action: str
) -> None:
    ghost = RoomRequest(
        sub="no-account", conn_id="c", room=f"{CHAT_ROOM_PREFIX}{env.event}"
    )
    call = (
        handler.message(ghost, _payload("hola"))
        if action == "message"
        else handler.subscribe(ghost)
    )

    with pytest.raises(UnauthorizedError) as exc:
        await call

    assert exc.value.code == "INVALID_SESSION"
    assert env.calls == []


@pytest.mark.parametrize(
    ("status", "code"),
    [
        (AccountStatus.SUSPENDED, "ACCOUNT_SUSPENDED"),
        (AccountStatus.BANNED, "ACCOUNT_SUSPENDED"),
        (AccountStatus.DELETED, "ACCOUNT_DELETED"),
    ],
)
async def test_a_suspended_or_deleted_account_cannot_use_the_chat(
    handler: ChatWsHandler,
    env: ChatFakes,
    accounts: InMemoryUserRepository,
    status: AccountStatus,
    code: str,
) -> None:
    accounts.users[SUB] = account(env.user, SUB, status)

    with pytest.raises(ForbiddenError) as exc:
        await handler.message(request(env), _payload("hola"))

    assert exc.value.code == code
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
    ack = await handler.message(request(env, conn="conn-5"), _payload(" hola "))

    [stored] = env.messages
    assert stored.text == "hola"
    assert stored.author_id == env.user
    envelope = json.loads(env.published[0])
    assert envelope["from"] == "conn-5"
    assert envelope["frame"]["payload"] == stored.model_dump(
        mode="json", exclude={"client_message_id"}
    )
    assert "client_message_id" not in envelope["frame"]["payload"]
    assert env.channels == [f"room:{CHAT_ROOM_PREFIX}{env.event}"]
    assert ack  # see the next test for its content


async def test_the_ack_is_the_id_and_the_timestamp_of_the_stored_message(
    handler: ChatWsHandler, env: ChatFakes
) -> None:
    ack = await handler.message(request(env), _payload("hola"))

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
    payload = {"client_message_id": str(uuid.uuid4()), **payload}
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
        await handler.message(request(env), _payload(text))

    assert exc.value.code == code
    assert env.published == []


async def test_a_message_of_a_user_not_subscribed_is_forbidden(
    handler: ChatWsHandler, env: ChatFakes
) -> None:
    env.subscribed = False

    with pytest.raises(ForbiddenError):
        await handler.message(request(env), _payload("hola"))

    assert env.messages == []


async def test_an_unavailable_database_is_not_hidden(
    handler: ChatWsHandler, env: ChatFakes
) -> None:
    env.fail_save = True

    with pytest.raises(ExternalServiceError) as exc:
        await handler.message(request(env), _payload("hola"))

    assert exc.value.code == "DATABASE_UNAVAILABLE"
    assert env.published == []


async def test_a_pubsub_failure_is_pubsub_unavailable_and_the_message_is_kept(
    handler: ChatWsHandler, env: ChatFakes
) -> None:
    env.fail_publish = True

    with pytest.raises(ExternalServiceError) as exc:
        await handler.message(request(env), _payload("hola"))

    assert exc.value.code == "PUBSUB_UNAVAILABLE"
    assert len(env.messages) == 1


# --- TG-654: client_message_id (idempotencia) ----------------------------------


async def test_tg654_the_client_message_id_reaches_the_stored_message(
    handler: ChatWsHandler, env: ChatFakes
) -> None:
    key = uuid.uuid4()

    await handler.message(request(env), _payload("hola", key))

    [stored] = env.messages
    assert stored.client_message_id == key


@pytest.mark.parametrize(
    "payload",
    [
        {"text": "hola"},
        {"text": "hola", "client_message_id": None},
        {"text": "hola", "client_message_id": 5},
        {"text": "hola", "client_message_id": str(uuid.uuid4()).upper()},
        {"text": "hola", "client_message_id": uuid.uuid4().hex},
        {"text": "hola", "client_message_id": "not-a-uuid"},
        {"text": "hola", "client_message_id": ""},
        {"text": "hola", "client_message_id": str(uuid.uuid4()) + " "},
    ],
    ids=[
        "absent",
        "null",
        "number",
        "upper-case",
        "no-hyphens",
        "text",
        "empty",
        "trailing-space",
    ],
)
async def test_tg654_a_missing_or_non_canonical_client_message_id_is_a_validation_error(
    handler: ChatWsHandler, env: ChatFakes, payload: dict[str, Any]
) -> None:
    with pytest.raises(ValidationError) as exc:
        await handler.message(request(env), payload)

    assert exc.value.code == "VALIDATION_ERROR"
    assert env.calls == []  # nothing was asked to the service
    assert env.published == []


async def test_tg654_an_identical_retry_gets_the_same_ack_and_is_not_stored_twice(
    handler: ChatWsHandler, env: ChatFakes
) -> None:
    key = uuid.uuid4()
    first = await handler.message(request(env), _payload("hola", key))

    second = await handler.message(request(env, conn="c-2"), _payload("hola", key))

    assert second == first
    assert len(env.messages) == 1


async def test_tg654_reusing_the_key_with_another_text_is_the_idempotency_conflict(
    handler: ChatWsHandler, env: ChatFakes
) -> None:
    key = uuid.uuid4()
    await handler.message(request(env), _payload("hola", key))

    with pytest.raises(ConflictError) as exc:
        await handler.message(request(env), _payload("un altre", key))

    assert exc.value.code == "CHAT_IDEMPOTENCY_CONFLICT"
    assert len(env.messages) == 1
