"""Room handlers injected in the real-time session by room prefix. TG-459.

A room whose name starts with a registered prefix is decided by its handler
(subscribe, unsubscribe, message); the rest of the rooms behave as before.
"""

import asyncio
from collections.abc import AsyncIterator
from typing import Any

import pytest
from app.application.realtime.room_handler import RoomHandler, RoomRequest

from app.application.auth.auth_service import AuthService, SessionDurations
from app.application.chat.errors import RateLimitedError
from app.application.realtime import errors
from app.application.realtime.realtime_session import RealtimeConfig, RealtimeSession
from app.application.shared.errors import (
    ApplicationError,
    ExternalServiceError,
    ForbiddenError,
)
from app.domain.auth.models import AccountStatus, GoogleIdentity
from app.domain.realtime.models import revocation_channel, room_channel
from app.domain.shared.errors import (
    BusinessRuleViolation,
    DomainError,
    NotFoundError,
    ValidationError,
)
from tests.fakes.auth import (
    FakeAccountGateway,
    FakeGoogleTokenVerifier,
    FakeTokenCodec,
)
from tests.fakes.pubsub import FakePubSub
from tests.fakes.realtime import FakeConnection, FlakySessionStore, wait_until
from tests.fakes.room_handler import FakeRoomHandler

SUB = "user-1"
PREFIX = "talk:"
ROOM = "talk:42"
CONFIG = RealtimeConfig(auth_timeout_seconds=1.0, heartbeat_seconds=30.0)
ONE_ROOM = RealtimeConfig(auth_timeout_seconds=1.0, heartbeat_seconds=30.0, max_rooms=1)
SETTLE = 0.05


class Harness:
    def __init__(self) -> None:
        self.codec = FakeTokenCodec()
        self.store = FlakySessionStore()
        self.pubsub = FakePubSub()
        self.handler = FakeRoomHandler()
        self.sub = ""
        self.tasks: list[asyncio.Task[None]] = []

    async def connect(
        self,
        conn_id: str = "conn-1",
        handlers: dict[str, RoomHandler] | None = None,
        config: RealtimeConfig = CONFIG,
    ) -> FakeConnection:
        auth = AuthService(
            FakeGoogleTokenVerifier(GoogleIdentity(google_sub=SUB, email="a@e.com")),
            self.codec,
            self.store,
            FakeAccountGateway(AccountStatus.ACTIVE),
            SessionDurations(access_seconds=900, refresh_seconds=3600),
        )
        tokens = await auth.login("google-id-token")
        self.sub = self.codec.decode(tokens.access_token).sub
        conn = FakeConnection(auto_pong=True)
        session = RealtimeSession(
            conn=conn,
            auth=auth,
            store=self.store,
            pubsub=self.pubsub,
            config=config,
            conn_id=conn_id,
            handlers={PREFIX: self.handler} if handlers is None else handlers,
        )
        self.tasks.append(asyncio.create_task(session.run()))
        conn.feed_frame({"type": "auth", "token": tokens.access_token})
        await conn.wait_for_sent(1)
        await wait_until(
            lambda: self.pubsub.subscriber_count(revocation_channel(self.sub)) >= 1
        )
        return conn

    async def join(self, conn: FakeConnection, room: str = ROOM) -> None:
        reply = await request(conn, {"type": "subscribe", "room": room, "id": "s"})
        assert reply["type"] == "subscribe"
        await wait_until(lambda: self.pubsub.subscriber_count(room_channel(room)) >= 1)


@pytest.fixture
async def harness() -> AsyncIterator[Harness]:
    env = Harness()
    yield env
    for task in env.tasks:
        task.cancel()
    await asyncio.gather(*env.tasks, return_exceptions=True)


async def request(conn: FakeConnection, frame: dict[str, Any]) -> dict[str, Any]:
    before = len(conn.sent)
    conn.feed_frame(frame)
    await conn.wait_for_sent(before + 1)
    return conn.sent_frames()[before]


async def assert_alive(conn: FakeConnection) -> None:
    await asyncio.sleep(SETTLE)
    assert conn.closed_code is None
    reply = await request(conn, {"type": "ping", "id": "alive"})
    assert (reply["type"], reply["id"]) == ("pong", "alive")


def message(room: str, frame_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    return {"type": "message", "room": room, "id": frame_id, "payload": payload}


# --- subscribe -------------------------------------------------------------------


async def test_subscribe_asks_the_handler_with_the_user_the_connection_and_the_room(
    harness: Harness,
) -> None:
    conn = await harness.connect("conn-7")

    reply = await request(conn, {"type": "subscribe", "room": ROOM, "id": "s1"})

    assert reply == {"type": "subscribe", "room": ROOM, "id": "s1", "payload": {}}
    assert harness.handler.subscribed == [
        RoomRequest(sub=harness.sub, conn_id="conn-7", room=ROOM)
    ]
    assert harness.pubsub.subscriber_count(room_channel(ROOM)) == 1


async def test_a_refused_subscription_is_an_error_frame_and_does_not_join(
    harness: Harness,
) -> None:
    harness.handler.failure = ForbiddenError(errors.FORBIDDEN)
    conn = await harness.connect()

    reply = await request(conn, {"type": "subscribe", "room": ROOM, "id": "s1"})

    assert (reply["type"], reply["room"], reply["id"]) == ("error", ROOM, "s1")
    assert reply["payload"]["code"] == "FORBIDDEN"
    assert reply["payload"]["status"] == 403
    assert harness.pubsub.subscriber_count(room_channel(ROOM)) == 0
    await assert_alive(conn)


async def test_a_refused_subscription_does_not_use_a_slot_of_the_room_limit(
    harness: Harness,
) -> None:
    harness.handler.failure = ForbiddenError(errors.FORBIDDEN)
    conn = await harness.connect(config=ONE_ROOM)
    await request(conn, {"type": "subscribe", "room": "talk:1", "id": "s1"})
    harness.handler.failure = None

    reply = await request(conn, {"type": "subscribe", "room": "talk:2", "id": "s2"})

    assert reply["type"] == "subscribe"


async def test_the_handler_is_not_asked_when_the_room_limit_is_reached(
    harness: Harness,
) -> None:
    conn = await harness.connect(config=ONE_ROOM)
    await harness.join(conn, "talk:1")

    reply = await request(conn, {"type": "subscribe", "room": "talk:2", "id": "s2"})

    assert reply["payload"]["code"] == "RATE_LIMITED"
    assert [r.room for r in harness.handler.subscribed] == ["talk:1"]


# --- unsubscribe -----------------------------------------------------------------


async def test_unsubscribe_asks_the_handler_and_leaves_the_room(
    harness: Harness,
) -> None:
    conn = await harness.connect()
    await harness.join(conn)

    reply = await request(conn, {"type": "unsubscribe", "room": ROOM, "id": "u1"})

    assert reply == {"type": "unsubscribe", "room": ROOM, "id": "u1", "payload": {}}
    assert [r.room for r in harness.handler.unsubscribed] == [ROOM]
    assert harness.pubsub.subscriber_count(room_channel(ROOM)) == 0


async def test_a_refused_unsubscribe_is_an_error_frame_and_stays_in_the_room(
    harness: Harness,
) -> None:
    conn = await harness.connect()
    await harness.join(conn)
    harness.handler.failure = ValidationError(errors.VALIDATION_ERROR)

    reply = await request(conn, {"type": "unsubscribe", "room": ROOM, "id": "u1"})

    assert reply["type"] == "error"
    assert reply["payload"]["code"] == "VALIDATION_ERROR"
    assert harness.pubsub.subscriber_count(room_channel(ROOM)) == 1


# --- message ---------------------------------------------------------------------


async def test_message_goes_to_the_handler_and_its_result_is_the_ack_payload(
    harness: Harness,
) -> None:
    harness.handler.ack = {"id": "m-1", "sent_at": "2026-11-18T10:00:00Z"}
    conn = await harness.connect("conn-9")
    await harness.join(conn)

    reply = await request(conn, message(ROOM, "m1", {"text": "hola"}))

    assert reply == {
        "type": "message",
        "room": ROOM,
        "id": "m1",
        "payload": {"id": "m-1", "sent_at": "2026-11-18T10:00:00Z"},
    }
    [(handled, payload)] = harness.handler.messages
    assert handled == RoomRequest(sub=harness.sub, conn_id="conn-9", room=ROOM)
    assert payload == {"text": "hola"}


async def test_the_session_does_not_publish_the_message_of_a_handled_room(
    harness: Harness,
) -> None:
    conn = await harness.connect()
    await harness.join(conn)

    await request(conn, message(ROOM, "m1", {"text": "x"}))

    assert harness.pubsub.published == []  # the handler owns the fan-out
    await assert_alive(conn)  # and there is no echo to the sender


async def test_the_handler_decides_a_message_before_the_generic_not_subscribed(
    harness: Harness,
) -> None:
    harness.handler.failure = ForbiddenError(errors.FORBIDDEN)
    conn = await harness.connect()

    reply = await request(conn, message(ROOM, "m1", {}))

    assert reply["payload"]["code"] == "FORBIDDEN"
    assert (reply["room"], reply["id"]) == (ROOM, "m1")


async def test_a_message_of_a_handled_room_works_without_joining_it(
    harness: Harness,
) -> None:
    conn = await harness.connect()

    reply = await request(conn, message(ROOM, "m1", {"text": "x"}))

    assert reply["type"] == "message"
    assert len(harness.handler.messages) == 1


async def test_a_room_without_handler_behaves_as_before(harness: Harness) -> None:
    conn = await harness.connect()

    refused = await request(conn, message("other:1", "m1", {}))
    joined = await request(conn, {"type": "subscribe", "room": "other:1", "id": "s"})
    echoed = await request(conn, message("other:1", "m2", {"a": 1}))

    assert refused["payload"]["code"] == "NOT_SUBSCRIBED"
    assert joined["type"] == "subscribe"
    assert echoed == {"type": "message", "room": "other:1", "id": "m2", "payload": {}}
    assert len(harness.pubsub.published) == 1  # raw republish, as before
    assert harness.handler.subscribed == []
    assert harness.handler.messages == []


async def test_without_any_handler_every_room_behaves_as_before(
    harness: Harness,
) -> None:
    conn = await harness.connect(handlers={})

    reply = await request(conn, message(ROOM, "m1", {}))

    assert reply["payload"]["code"] == "NOT_SUBSCRIBED"


async def test_the_prefix_is_matched_at_the_start_of_the_room_name(
    harness: Harness,
) -> None:
    conn = await harness.connect()

    reply = await request(conn, message("x:talk:1", "m1", {}))

    assert reply["payload"]["code"] == "NOT_SUBSCRIBED"
    assert harness.handler.messages == []


async def test_the_longest_matching_prefix_wins(harness: Harness) -> None:
    specific = FakeRoomHandler()
    conn = await harness.connect(
        handlers={"talk:": harness.handler, "talk:vip:": specific}
    )

    await request(conn, message("talk:vip:1", "m1", {}))

    assert len(specific.messages) == 1
    assert harness.handler.messages == []


# --- errors of the handlers ------------------------------------------------------

CASES: list[tuple[Exception, str, int]] = [
    (ValidationError("CHAT_MESSAGE_EMPTY"), "CHAT_MESSAGE_EMPTY", 422),
    (ValidationError("CHAT_MESSAGE_TOO_LONG"), "CHAT_MESSAGE_TOO_LONG", 422),
    (BusinessRuleViolation("CHAT_MESSAGE_REJECTED"), "CHAT_MESSAGE_REJECTED", 422),
    (ValidationError("VALIDATION_ERROR"), "VALIDATION_ERROR", 422),
    (NotFoundError("EVENT_NOT_FOUND"), "EVENT_NOT_FOUND", 404),
    (NotFoundError("CHAT_ROOM_NOT_FOUND"), "CHAT_ROOM_NOT_FOUND", 404),
    (ForbiddenError("FORBIDDEN"), "FORBIDDEN", 403),
    (RateLimitedError("RATE_LIMITED"), "RATE_LIMITED", 429),
    (ExternalServiceError("PUBSUB_UNAVAILABLE"), "PUBSUB_UNAVAILABLE", 503),
    (ExternalServiceError("DATABASE_UNAVAILABLE"), "DATABASE_UNAVAILABLE", 503),
    # an unknown code never reaches the client as such
    (ExternalServiceError("REDIS_DOWN"), "PUBSUB_UNAVAILABLE", 503),
    (DomainError("SOMETHING_NEW"), "INTERNAL_ERROR", 500),
    (ApplicationError("SOMETHING_NEW"), "INTERNAL_ERROR", 500),
]


@pytest.mark.parametrize(
    ("failure", "code", "status"), CASES, ids=[str(case[0]) for case in CASES]
)
async def test_a_handler_error_is_a_frame_with_its_code_and_the_connection_lives(
    harness: Harness, failure: Exception, code: str, status: int
) -> None:
    harness.handler.failure = failure
    conn = await harness.connect()

    reply = await request(conn, message(ROOM, "m1", {"text": "x"}))

    assert (reply["type"], reply["room"], reply["id"]) == ("error", ROOM, "m1")
    assert reply["payload"]["code"] == code
    assert reply["payload"]["status"] == status
    assert reply["payload"]["correlation_id"] == "conn-1"
    await assert_alive(conn)


async def test_an_unknown_error_does_not_leak_its_message(harness: Harness) -> None:
    harness.handler.failure = DomainError("SOMETHING_NEW", "secret internals")
    conn = await harness.connect()

    reply = await request(conn, message(ROOM, "m1", {}))

    assert "secret internals" not in str(reply)


async def test_an_error_of_one_client_does_not_affect_another(
    harness: Harness,
) -> None:
    first = await harness.connect("conn-a")
    second = await harness.connect("conn-b")
    await harness.join(second)
    harness.handler.failure = ValidationError("CHAT_MESSAGE_EMPTY")

    reply = await request(first, message(ROOM, "m1", {}))

    assert reply["type"] == "error"
    await assert_alive(first)
    await assert_alive(second)
    assert harness.pubsub.subscriber_count(room_channel(ROOM)) == 1
