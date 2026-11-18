"""Room handlers injected in the real-time session by room prefix. TG-459.

A room whose name starts with a registered prefix is decided by its handler
(subscribe, unsubscribe, message); the rest of the rooms behave as before.
"""

import asyncio
import json
from collections.abc import AsyncIterator
from typing import Any

import pytest

from app.application.auth.auth_service import AuthService, SessionDurations
from app.application.chat.errors import RateLimitedError
from app.application.realtime import errors
from app.application.realtime.realtime_session import RealtimeConfig, RealtimeSession
from app.application.realtime.room_handler import RoomHandler, RoomRequest
from app.application.shared.errors import (
    ApplicationError,
    ExternalServiceError,
    ForbiddenError,
    UnauthorizedError,
)
from app.domain.auth.models import AccountStatus, GoogleIdentity
from app.domain.realtime.models import (
    revocation_channel,
    room_channel,
    room_revocation_channel,
)
from app.domain.realtime.ports import ConnectionClosed
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


# Contract change (TG-459, decision of the architecture review): before, a
# ``message`` to a handled room worked without a previous ``subscribe``. Now the
# connection must have joined: whoever may join but has not is NOT_SUBSCRIBED.
async def test_a_message_of_a_handled_room_needs_the_connection_to_have_joined_it(
    harness: Harness,
) -> None:
    conn = await harness.connect()

    reply = await request(conn, message(ROOM, "m1", {"text": "x"}))

    assert (reply["type"], reply["room"], reply["id"]) == ("error", ROOM, "m1")
    assert reply["payload"]["code"] == "NOT_SUBSCRIBED"
    assert harness.handler.messages == []  # nothing is handled, stored or sent
    assert harness.pubsub.published == []
    await assert_alive(conn)


async def test_the_forbidden_of_the_handler_wins_over_not_subscribed(
    harness: Harness,
) -> None:
    conn = await harness.connect()
    harness.handler.failure = ForbiddenError(errors.FORBIDDEN)

    reply = await request(conn, message(ROOM, "m1", {"text": "x"}))

    assert reply["payload"]["code"] == "FORBIDDEN"
    assert harness.handler.messages == []


async def test_after_leaving_a_handled_room_a_message_is_not_subscribed(
    harness: Harness,
) -> None:
    conn = await harness.connect()
    await harness.join(conn)
    await request(conn, {"type": "unsubscribe", "room": ROOM, "id": "u1"})

    reply = await request(conn, message(ROOM, "m1", {"text": "x"}))

    assert reply["payload"]["code"] == "NOT_SUBSCRIBED"
    assert harness.handler.messages == []


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
    await harness.join(conn, "talk:vip:1")

    await request(conn, message("talk:vip:1", "m1", {}))

    assert len(specific.messages) == 1
    assert harness.handler.messages == []


# --- loss of a room (the user left the event) -----------------------------------


async def lose_room(harness: Harness, sub: str, payload: Any) -> None:
    raw = payload if isinstance(payload, str) else json.dumps(payload)
    await harness.pubsub.publish(room_revocation_channel(sub), raw)


async def test_a_lost_room_is_left_and_the_client_gets_an_unsubscribe_frame(
    harness: Harness,
) -> None:
    conn = await harness.connect()
    await harness.join(conn)
    await harness.join(conn, "talk:other")
    before = len(conn.sent)

    await lose_room(harness, harness.sub, {"room": ROOM})
    await conn.wait_for_sent(before + 1)

    assert conn.sent_frames()[before] == {
        "type": "unsubscribe",
        "room": ROOM,
        "payload": {},
    }
    assert harness.pubsub.subscriber_count(room_channel(ROOM)) == 0
    assert harness.pubsub.subscriber_count(room_channel("talk:other")) == 1
    await assert_alive(conn)  # the socket stays open


async def test_after_losing_a_room_a_message_to_it_is_not_subscribed(
    harness: Harness,
) -> None:
    conn = await harness.connect()
    await harness.join(conn)
    before = len(conn.sent)
    await lose_room(harness, harness.sub, {"room": ROOM})
    await conn.wait_for_sent(before + 1)

    reply = await request(conn, message(ROOM, "m1", {"text": "x"}))

    assert reply["payload"]["code"] == "NOT_SUBSCRIBED"
    assert harness.handler.messages == []


async def test_a_room_lost_by_a_user_does_not_touch_the_connections_of_another(
    harness: Harness,
) -> None:
    conn = await harness.connect()
    await harness.join(conn)

    await lose_room(harness, "someone-else", {"room": ROOM})

    await assert_alive(conn)
    assert harness.pubsub.subscriber_count(room_channel(ROOM)) == 1
    assert len(conn.sent) == 3  # auth, subscribe ack and the pong of the check


async def test_losing_a_room_that_was_not_joined_sends_nothing(
    harness: Harness,
) -> None:
    conn = await harness.connect()
    sent = len(conn.sent)

    await lose_room(harness, harness.sub, {"room": ROOM})

    await assert_alive(conn)
    assert len(conn.sent) == sent + 1  # only the pong of the check


@pytest.mark.parametrize(
    "payload",
    ["not json", "[]", {}, {"room": 7}, {"room": None}],
    ids=["not-json", "list", "no-room", "room-not-str", "room-null"],
)
async def test_a_malformed_room_loss_is_ignored(harness: Harness, payload: Any) -> None:
    conn = await harness.connect()
    await harness.join(conn)

    await lose_room(harness, harness.sub, payload)

    await assert_alive(conn)
    assert harness.pubsub.subscriber_count(room_channel(ROOM)) == 1


async def test_a_room_without_handler_can_be_lost_too(harness: Harness) -> None:
    conn = await harness.connect()
    await harness.join(conn, "other:1")
    before = len(conn.sent)

    await lose_room(harness, harness.sub, {"room": "other:1"})
    await conn.wait_for_sent(before + 1)

    assert conn.sent_frames()[before]["type"] == "unsubscribe"
    assert harness.pubsub.subscriber_count(room_channel("other:1")) == 0


# --- errors of the handlers ------------------------------------------------------

CASES: list[tuple[Exception, str, int]] = [
    (ValidationError("CHAT_MESSAGE_EMPTY"), "CHAT_MESSAGE_EMPTY", 422),
    (ValidationError("CHAT_MESSAGE_TOO_LONG"), "CHAT_MESSAGE_TOO_LONG", 422),
    (BusinessRuleViolation("CHAT_MESSAGE_REJECTED"), "CHAT_MESSAGE_REJECTED", 422),
    (ValidationError("VALIDATION_ERROR"), "VALIDATION_ERROR", 422),
    (NotFoundError("EVENT_NOT_FOUND"), "EVENT_NOT_FOUND", 404),
    (NotFoundError("CHAT_ROOM_NOT_FOUND"), "CHAT_ROOM_NOT_FOUND", 404),
    (ForbiddenError("FORBIDDEN"), "FORBIDDEN", 403),
    (ForbiddenError("ACCOUNT_SUSPENDED"), "ACCOUNT_SUSPENDED", 403),
    (ForbiddenError("ACCOUNT_DELETED"), "ACCOUNT_DELETED", 403),
    (UnauthorizedError("INVALID_SESSION"), "INVALID_SESSION", 401),
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


@pytest.mark.parametrize(
    ("failure", "title"),
    [
        (
            ForbiddenError("FORBIDDEN", "user 7 is not in the room of event 9"),
            "Forbidden",
        ),
        (
            NotFoundError("EVENT_NOT_FOUND", "no row in astronomical_events"),
            "Not Found",
        ),
        (
            ExternalServiceError("DATABASE_UNAVAILABLE", "host db:5432 down"),
            "Service Unavailable",
        ),
    ],
    ids=["forbidden", "not-found", "database"],
)
async def test_a_known_code_goes_with_a_generic_detail_not_the_raw_message(
    harness: Harness, failure: Exception, title: str
) -> None:
    harness.handler.failure = failure
    conn = await harness.connect()

    reply = await request(conn, message(ROOM, "m1", {"text": "x"}))

    assert reply["payload"]["code"] == failure.code  # type: ignore[attr-defined]
    assert reply["payload"]["detail"] == title
    assert str(failure.message) not in str(reply)  # type: ignore[attr-defined]


async def test_an_unexpected_exception_of_a_handler_is_an_internal_error_frame(
    harness: Harness,
) -> None:
    harness.handler.failure = RuntimeError("boom: secret internals")
    conn = await harness.connect()

    reply = await request(conn, message(ROOM, "m1", {"text": "x"}))

    assert (reply["type"], reply["room"], reply["id"]) == ("error", ROOM, "m1")
    assert reply["payload"]["code"] == "INTERNAL_ERROR"
    assert reply["payload"]["status"] == 500
    assert "secret internals" not in str(reply)
    await assert_alive(conn)  # the connection stays open


async def test_a_connection_closed_in_a_handler_still_ends_the_session(
    harness: Harness,
) -> None:
    harness.handler.failure = ConnectionClosed()
    conn = await harness.connect()

    conn.feed_frame(message(ROOM, "m1", {"text": "x"}))
    await wait_until(lambda: harness.tasks[-1].done())

    assert conn.sent_frames()[1:] == []  # no INTERNAL_ERROR frame was attempted


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
