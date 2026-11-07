"""RealtimeSession with fake ports. TG-63 / US #63 (crit. 2-11)."""

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from contextlib import AbstractAsyncContextManager
from dataclasses import dataclass, field
from typing import Any

import pytest

from app.application.auth.auth_service import AuthService, SessionDurations
from app.application.realtime import errors
from app.application.realtime.realtime_session import RealtimeConfig, RealtimeSession
from app.domain.auth.models import (
    AccountStatus,
    GoogleIdentity,
    SessionClaims,
    TokenType,
)
from app.domain.realtime.models import revocation_channel, room_channel
from tests.fakes.auth import (
    FakeAccountGateway,
    FakeGoogleTokenVerifier,
    FakeTokenCodec,
)
from tests.fakes.pubsub import FakePubSub
from tests.fakes.realtime import (
    SAFETY_TIMEOUT,
    FakeConnection,
    FlakySessionStore,
    wait_until,
)

DURATIONS = SessionDurations(access_seconds=900, refresh_seconds=2_592_000)
SUB = "google-123"
CONFIG = RealtimeConfig(auth_timeout_seconds=1.0, heartbeat_seconds=30.0)
FAST_HEARTBEAT = RealtimeConfig(auth_timeout_seconds=1.0, heartbeat_seconds=0.05)
SETTLE = 0.05  # time given to the session to (not) react; never a correctness wait


@dataclass
class Env:
    codec: FakeTokenCodec
    store: FlakySessionStore
    auth: AuthService
    pubsub: FakePubSub
    tasks: list[asyncio.Task[None]] = field(default_factory=list)

    async def login(self, sub: str = SUB) -> tuple[str, str, SessionClaims]:
        """Real login; returns (access token, refresh token, access claims)."""
        identity = GoogleIdentity(google_sub=sub, email=f"{sub}@example.com")
        service = AuthService(
            FakeGoogleTokenVerifier(identity),
            self.codec,
            self.store,
            FakeAccountGateway(AccountStatus.ACTIVE),
            DURATIONS,
        )
        tokens = await service.login("google-id-token")
        return (
            tokens.access_token,
            tokens.refresh_token,
            self.codec.decode(tokens.access_token),
        )


@dataclass
class Client:
    conn: FakeConnection
    task: asyncio.Task[None]
    token: str = ""
    claims: SessionClaims | None = None

    async def finished(self) -> None:
        await asyncio.wait_for(self.task, SAFETY_TIMEOUT)

    def frames(self) -> list[dict[str, Any]]:
        return self.conn.sent_frames()


@pytest.fixture
async def env() -> AsyncIterator[Env]:
    codec = FakeTokenCodec()
    store = FlakySessionStore()
    auth = AuthService(
        FakeGoogleTokenVerifier(GoogleIdentity(google_sub=SUB, email="a@e.com")),
        codec,
        store,
        FakeAccountGateway(AccountStatus.ACTIVE),
        DURATIONS,
    )
    environment = Env(codec, store, auth, FakePubSub())
    yield environment
    for task in environment.tasks:
        task.cancel()
    await asyncio.gather(*environment.tasks, return_exceptions=True)


def start(
    env: Env,
    conn_id: str = "conn-1",
    config: RealtimeConfig = CONFIG,
    auto_pong: bool = True,
) -> Client:
    """Start a session on a fresh connection, before any frame is sent."""
    conn = FakeConnection(auto_pong=auto_pong)
    session = RealtimeSession(
        conn=conn,
        auth=env.auth,
        store=env.store,
        pubsub=env.pubsub,
        config=config,
        conn_id=conn_id,
    )
    task = asyncio.create_task(session.run())
    env.tasks.append(task)
    return Client(conn, task)


async def connect(
    env: Env,
    conn_id: str = "conn-1",
    sub: str = SUB,
    config: RealtimeConfig = CONFIG,
    auto_pong: bool = True,
) -> Client:
    """Start a session and authenticate it with a real access token."""
    client = start(env, conn_id, config, auto_pong)
    client.token, _, client.claims = await env.login(sub)
    client.conn.feed_frame({"type": "auth", "token": client.token})
    await client.conn.wait_for_sent(1)
    await wait_until(lambda: env.pubsub.subscriber_count(revocation_channel(sub)) >= 1)
    return client


def pick(frame: dict[str, Any], *keys: str) -> dict[str, Any]:
    """The given keys of a frame; a missing key reads as None."""
    return {key: frame.get(key) for key in keys}


async def request(client: Client, frame: dict[str, Any]) -> dict[str, Any]:
    """Send a frame and return the next frame the server sends back."""
    before = len(client.conn.sent)
    client.conn.feed_frame(frame)
    await client.conn.wait_for_sent(before + 1)
    return client.frames()[before]


async def assert_alive(client: Client) -> None:
    """The connection is open and still answers pings."""
    await asyncio.sleep(SETTLE)
    assert client.conn.closed_code is None
    reply = await request(client, {"type": "ping", "id": "alive-check"})
    assert pick(reply, "type", "id") == {"type": "pong", "id": "alive-check"}


def log_text(caplog: pytest.LogCaptureFixture) -> str:
    parts: list[str] = []
    for record in caplog.records:
        parts += [
            record.getMessage(),
            str(record.msg),
            str(record.args),
            record.exc_text or "",
        ]
    return "\n".join(parts)


def pending_tasks(env: Env) -> set[asyncio.Task[Any]]:
    return asyncio.all_tasks() - {asyncio.current_task()} - set(env.tasks)


async def revoke(env: Env, sub: str, message: str) -> None:
    await env.pubsub.publish(revocation_channel(sub), message)


# --- handshake and authentication (crit. 2, 3) -------------------------------


async def test_valid_access_token_is_acknowledged_with_an_auth_echo(env: Env) -> None:
    client = await connect(env)

    frames = client.frames()
    assert len(frames) == 1
    assert pick(frames[0], "type", "payload") == {"type": "auth", "payload": {}}
    assert client.conn.closed_code is None


async def test_authenticated_session_is_subscribed_to_its_revocation_channel(
    env: Env,
) -> None:
    await connect(env)

    assert env.pubsub.subscriber_count(revocation_channel(SUB)) == 1


async def test_invalid_token_closes_with_4401_and_sends_nothing(env: Env) -> None:
    client = start(env)

    client.conn.feed_frame({"type": "auth", "token": "not-a-real-token"})

    assert await client.conn.wait_closed() == errors.CLOSE_UNAUTHENTICATED
    assert client.conn.sent == []
    await client.finished()


async def test_refresh_token_is_rejected_as_access_token(env: Env) -> None:
    _, refresh, _ = await env.login()
    client = start(env)

    client.conn.feed_frame({"type": "auth", "token": refresh})

    assert await client.conn.wait_closed() == errors.CLOSE_UNAUTHENTICATED
    assert client.conn.sent == []


async def test_expired_token_closes_with_4401(env: Env) -> None:
    access, _, _ = await env.login()
    env.codec.expire(access)
    client = start(env)

    client.conn.feed_frame({"type": "auth", "token": access})

    assert await client.conn.wait_closed() == errors.CLOSE_UNAUTHENTICATED
    assert client.conn.sent == []


async def test_revoked_token_closes_with_4401(env: Env) -> None:
    access, _, claims = await env.login()
    env.store.expire(TokenType.ACCESS, claims.jti)
    client = start(env)

    client.conn.feed_frame({"type": "auth", "token": access})

    assert await client.conn.wait_closed() == errors.CLOSE_UNAUTHENTICATED
    assert client.conn.sent == []


@pytest.mark.parametrize(
    "first_frame",
    [
        "this is not json",
        "[]",
        '"auth"',
        "{}",
        '{"type": "subscribe", "room": "sala-a"}',
        '{"type": "ping", "id": "p1"}',
        '{"type": "auth"}',
        '{"type": "auth", "token": 123}',
        '{"type": "auth", "payload": {"token": "token-1"}}',
    ],
)
async def test_first_frame_that_is_not_a_valid_auth_closes_with_4401(
    env: Env, first_frame: str
) -> None:
    await env.login()  # token-1 exists and is valid, but not in the right place
    client = start(env)

    client.conn.feed(first_frame)

    assert await client.conn.wait_closed() == errors.CLOSE_UNAUTHENTICATED
    assert client.conn.sent == []
    await client.finished()


async def test_no_first_frame_before_the_timeout_closes_with_4401(env: Env) -> None:
    client = start(
        env, config=RealtimeConfig(auth_timeout_seconds=0.05, heartbeat_seconds=30.0)
    )

    assert await client.conn.wait_closed() == errors.CLOSE_UNAUTHENTICATED
    assert client.conn.sent == []
    await client.finished()


async def test_auth_frame_arriving_before_the_timeout_is_accepted(env: Env) -> None:
    client = start(
        env, config=RealtimeConfig(auth_timeout_seconds=0.5, heartbeat_seconds=30.0)
    )
    access, _, _ = await env.login()

    await asyncio.sleep(0.05)
    client.conn.feed_frame({"type": "auth", "token": access})
    await client.conn.wait_for_sent(1)

    assert client.frames()[0]["type"] == "auth"
    assert client.conn.closed_code is None


async def test_session_store_down_while_authenticating_closes_with_1013(
    env: Env,
) -> None:
    access, _, _ = await env.login()
    env.store.failing = True
    client = start(env)

    client.conn.feed_frame({"type": "auth", "token": access})

    assert await client.conn.wait_closed() == errors.CLOSE_TRY_AGAIN_LATER
    await client.finished()


async def test_client_leaving_before_authenticating_ends_run(env: Env) -> None:
    client = start(env)

    client.conn.disconnect()

    await client.finished()
    assert env.pubsub.active_channels() == []


# --- the token never reaches the logs (crit. 4) ------------------------------


async def test_invalid_token_is_not_logged(
    env: Env, caplog: pytest.LogCaptureFixture
) -> None:
    secret = "super-secret-invalid-token-value"
    caplog.set_level(logging.DEBUG)
    client = start(env)

    client.conn.feed_frame({"type": "auth", "token": secret})
    await client.conn.wait_closed()
    await client.finished()

    assert secret not in log_text(caplog)


async def test_valid_token_is_not_logged(
    env: Env, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG)
    client = await connect(env)
    client.conn.disconnect()
    await client.finished()

    assert client.token
    assert client.token not in log_text(caplog)


# --- protocol (crit. 7) -------------------------------------------------------


@pytest.mark.parametrize(
    ("raw", "frame_id"),
    [
        ("this is not json", None),
        ("[]", None),
        ('"text"', None),
        ("42", None),
        ('{"type": "subscribe", "room": "sala-a", "extra": 1, "id": "x3"}', "x3"),
        ('{"type": "message", "room": "sala-a", "payload": [1], "id": "x4"}', "x4"),
        ('{"type": "subscribe", "room": "BAD ROOM", "id": "x2"}', "x2"),
        ('{"room": "sala-a", "id": "x5"}', "x5"),
    ],
)
async def test_malformed_frame_gets_a_validation_error_and_keeps_the_connection(
    env: Env, raw: str, frame_id: str | None
) -> None:
    client = await connect(env)
    before = len(client.conn.sent)

    client.conn.feed(raw)
    await client.conn.wait_for_sent(before + 1)

    reply = client.frames()[before]
    assert reply["type"] == "error"
    assert reply["payload"]["code"] == errors.VALIDATION_ERROR
    assert reply["payload"]["status"] == 422
    assert reply.get("id") == frame_id
    await assert_alive(client)


async def test_unknown_frame_type_gets_an_error_and_keeps_the_connection(
    env: Env,
) -> None:
    client = await connect(env)

    reply = await request(client, {"type": "teleport", "id": "u1"})

    assert reply["type"] == "error"
    assert reply["payload"]["code"] == errors.UNKNOWN_FRAME_TYPE
    assert reply["payload"]["status"] == 422
    assert reply["id"] == "u1"
    await assert_alive(client)


async def test_a_second_auth_frame_is_a_validation_error(env: Env) -> None:
    client = await connect(env)

    reply = await request(client, {"type": "auth", "token": client.token, "id": "a2"})

    assert reply["type"] == "error"
    assert reply["payload"]["code"] == errors.VALIDATION_ERROR
    assert reply["id"] == "a2"
    await assert_alive(client)


async def test_an_error_frame_sent_by_the_client_is_a_validation_error(
    env: Env,
) -> None:
    client = await connect(env)

    reply = await request(client, {"type": "error", "id": "e1"})

    assert reply["type"] == "error"
    assert reply["payload"]["code"] == errors.VALIDATION_ERROR
    assert reply["id"] == "e1"
    await assert_alive(client)


async def test_a_pong_from_the_client_is_accepted_silently(env: Env) -> None:
    client = await connect(env, auto_pong=False)
    before = len(client.conn.sent)

    client.conn.feed_frame({"type": "pong", "id": "whatever"})
    await assert_alive(client)

    # the pong got no reply: the only frame since is the alive-check's pong
    assert [f["type"] for f in client.frames()[before:]] == ["pong"]


# --- subscriptions (crit. 5) --------------------------------------------------


async def test_subscribe_joins_the_room_channel_and_echoes_the_frame(
    env: Env,
) -> None:
    client = await connect(env)

    reply = await request(client, {"type": "subscribe", "room": "sala-a", "id": "s1"})

    assert pick(reply, "type", "room", "payload", "id") == {
        "type": "subscribe",
        "room": "sala-a",
        "payload": {},
        "id": "s1",
    }
    assert env.pubsub.subscriber_count(room_channel("sala-a")) == 1


async def test_subscribe_without_room_is_a_validation_error(env: Env) -> None:
    client = await connect(env)

    reply = await request(client, {"type": "subscribe", "id": "s2"})

    assert reply["type"] == "error"
    assert reply["payload"]["code"] == errors.VALIDATION_ERROR
    assert reply["id"] == "s2"
    await assert_alive(client)


async def test_subscribing_twice_to_a_room_keeps_a_single_subscription(
    env: Env,
) -> None:
    client = await connect(env)
    await request(client, {"type": "subscribe", "room": "sala-a", "id": "s1"})

    reply = await request(client, {"type": "subscribe", "room": "sala-a", "id": "s2"})

    assert pick(reply, "type", "room", "id") == {
        "type": "subscribe",
        "room": "sala-a",
        "id": "s2",
    }
    assert env.pubsub.subscriber_count(room_channel("sala-a")) == 1


async def test_a_double_subscription_delivers_each_message_only_once(
    env: Env,
) -> None:
    client = await connect(env)
    await request(client, {"type": "subscribe", "room": "sala-a", "id": "s1"})
    await request(client, {"type": "subscribe", "room": "sala-a", "id": "s2"})
    inbound = {
        "from": "other",
        "frame": {"type": "message", "room": "sala-a", "payload": {"n": 1}, "id": "m"},
    }
    before = len(client.conn.sent)

    await env.pubsub.publish(room_channel("sala-a"), json.dumps(inbound))
    await client.conn.wait_for_sent(before + 1)
    await asyncio.sleep(SETTLE)

    assert len(client.conn.sent) == before + 1


async def test_unsubscribe_echoes_and_releases_the_subscription(env: Env) -> None:
    client = await connect(env)
    await request(client, {"type": "subscribe", "room": "sala-a", "id": "s1"})

    reply = await request(client, {"type": "unsubscribe", "room": "sala-a", "id": "u1"})

    assert pick(reply, "type", "room", "payload", "id") == {
        "type": "unsubscribe",
        "room": "sala-a",
        "payload": {},
        "id": "u1",
    }
    await wait_until(lambda: env.pubsub.subscriber_count(room_channel("sala-a")) == 0)


async def test_unsubscribing_from_a_room_not_joined_is_not_an_error(env: Env) -> None:
    client = await connect(env)

    reply = await request(client, {"type": "unsubscribe", "room": "sala-z", "id": "u9"})

    assert pick(reply, "type", "room", "id") == {
        "type": "unsubscribe",
        "room": "sala-z",
        "id": "u9",
    }
    assert client.conn.closed_code is None


async def test_unsubscribed_room_no_longer_delivers_messages(env: Env) -> None:
    client = await connect(env)
    await request(client, {"type": "subscribe", "room": "sala-a", "id": "s1"})
    await request(client, {"type": "unsubscribe", "room": "sala-a", "id": "u1"})
    before = len(client.conn.sent)
    inbound = {
        "from": "other",
        "frame": {"type": "message", "room": "sala-a", "payload": {}, "id": "m"},
    }

    await env.pubsub.publish(room_channel("sala-a"), json.dumps(inbound))
    await asyncio.sleep(SETTLE)

    assert len(client.conn.sent) == before


# --- messages through pub/sub (crit. 6) ---------------------------------------


async def test_message_is_published_to_the_room_channel_and_echoed(env: Env) -> None:
    client = await connect(env, conn_id="conn-1")
    await request(client, {"type": "subscribe", "room": "sala-a", "id": "s1"})
    frame = {
        "type": "message",
        "room": "sala-a",
        "payload": {"text": "hola"},
        "id": "m1",
    }

    reply = await request(client, frame)

    assert pick(reply, "type", "room", "payload", "id") == {
        "type": "message",
        "room": "sala-a",
        "payload": {},
        "id": "m1",
    }
    published = [m for c, m in env.pubsub.published if c == room_channel("sala-a")]
    assert [json.loads(m) for m in published] == [{"from": "conn-1", "frame": frame}]


async def test_published_frame_has_no_none_fields(env: Env) -> None:
    client = await connect(env, conn_id="conn-1")
    await request(client, {"type": "subscribe", "room": "sala-a"})

    await request(client, {"type": "message", "room": "sala-a"})

    published = [m for c, m in env.pubsub.published if c == room_channel("sala-a")]
    assert json.loads(published[0])["frame"] == {
        "type": "message",
        "room": "sala-a",
        "payload": {},
    }


async def test_other_subscribers_receive_the_original_frame(env: Env) -> None:
    sender = await connect(env, conn_id="conn-1")
    receiver = await connect(env, conn_id="conn-2")
    await request(sender, {"type": "subscribe", "room": "sala-a", "id": "s1"})
    await request(receiver, {"type": "subscribe", "room": "sala-a", "id": "s2"})
    before = len(receiver.conn.sent)

    await request(
        sender,
        {"type": "message", "room": "sala-a", "payload": {"text": "hola"}, "id": "m1"},
    )
    await receiver.conn.wait_for_sent(before + 1)

    assert pick(receiver.frames()[before], "type", "room", "payload", "id") == {
        "type": "message",
        "room": "sala-a",
        "payload": {"text": "hola"},
        "id": "m1",
    }


async def test_the_sender_does_not_receive_its_own_message(env: Env) -> None:
    sender = await connect(env, conn_id="conn-1")
    receiver = await connect(env, conn_id="conn-2")
    await request(sender, {"type": "subscribe", "room": "sala-a", "id": "s1"})
    await request(receiver, {"type": "subscribe", "room": "sala-a", "id": "s2"})
    before = len(sender.conn.sent)
    received_before = len(receiver.conn.sent)

    await request(sender, {"type": "message", "room": "sala-a", "id": "m1"})
    await receiver.conn.wait_for_sent(received_before + 1)
    await asyncio.sleep(SETTLE)

    # only the echo: the broadcast of its own message is filtered out
    assert len(sender.conn.sent) == before + 1


async def test_a_client_in_another_room_does_not_receive_the_message(
    env: Env,
) -> None:
    sender = await connect(env, conn_id="conn-1")
    elsewhere = await connect(env, conn_id="conn-2")
    await request(sender, {"type": "subscribe", "room": "sala-a", "id": "s1"})
    await request(elsewhere, {"type": "subscribe", "room": "sala-b", "id": "s2"})
    before = len(elsewhere.conn.sent)

    await request(sender, {"type": "message", "room": "sala-a", "id": "m1"})
    await asyncio.sleep(SETTLE)

    assert len(elsewhere.conn.sent) == before


async def test_message_to_a_room_not_joined_is_not_subscribed_error(env: Env) -> None:
    client = await connect(env)

    reply = await request(
        client, {"type": "message", "room": "sala-a", "payload": {}, "id": "m1"}
    )

    assert reply["type"] == "error"
    assert reply["payload"]["code"] == errors.NOT_SUBSCRIBED
    assert reply["payload"]["status"] == 409
    assert reply["id"] == "m1"
    assert env.pubsub.published == []
    await assert_alive(client)


async def test_message_without_room_is_a_validation_error(env: Env) -> None:
    client = await connect(env)

    reply = await request(client, {"type": "message", "payload": {}, "id": "m2"})

    assert reply["type"] == "error"
    assert reply["payload"]["code"] == errors.VALIDATION_ERROR
    assert reply["id"] == "m2"
    await assert_alive(client)


# --- ping/pong and heartbeat (crit. 8) ----------------------------------------


async def test_client_ping_is_answered_with_a_pong_of_the_same_id(env: Env) -> None:
    client = await connect(env)

    reply = await request(client, {"type": "ping", "id": "p-7"})

    assert pick(reply, "type", "id", "room") == {
        "type": "pong",
        "id": "p-7",
        "room": None,
    }


async def test_server_sends_pings_with_their_own_id_at_each_heartbeat(
    env: Env,
) -> None:
    client = await connect(env, config=FAST_HEARTBEAT, auto_pong=True)

    await client.conn.wait_for_sent(3)

    pings = [f for f in client.frames() if f["type"] == "ping"]
    assert len(pings) >= 2
    assert all(ping.get("id") for ping in pings)
    assert len({ping["id"] for ping in pings}) == len(pings)


async def test_client_answering_pongs_keeps_the_connection_open(env: Env) -> None:
    client = await connect(env, config=FAST_HEARTBEAT, auto_pong=True)

    await client.conn.wait_for_sent(5)  # several heartbeats went by

    assert client.conn.closed_code is None


async def test_missing_pong_closes_with_1001_and_releases_subscriptions(
    env: Env,
) -> None:
    client = await connect(env, config=FAST_HEARTBEAT, auto_pong=False)
    client.conn.auto_pong = False
    await request(client, {"type": "subscribe", "room": "sala-a", "id": "s1"})

    assert await client.conn.wait_closed() == errors.CLOSE_GOING_AWAY
    await client.finished()
    assert env.pubsub.active_channels() == []


async def test_expired_access_token_closes_with_4401_at_the_next_tick(
    env: Env,
) -> None:
    client = await connect(env, config=FAST_HEARTBEAT, auto_pong=True)
    assert client.claims is not None

    env.store.expire(TokenType.ACCESS, client.claims.jti)

    assert await client.conn.wait_closed() == errors.CLOSE_UNAUTHENTICATED
    await client.finished()
    assert env.pubsub.active_channels() == []


async def test_store_down_at_a_heartbeat_closes_with_1013(env: Env) -> None:
    client = await connect(env, config=FAST_HEARTBEAT, auto_pong=True)

    env.store.failing = True

    assert await client.conn.wait_closed() == errors.CLOSE_TRY_AGAIN_LATER
    await client.finished()


# --- live revocation (crit. 10) -----------------------------------------------


async def test_revoking_the_own_session_closes_with_4401(env: Env) -> None:
    client = await connect(env)
    assert client.claims is not None

    await revoke(env, SUB, json.dumps({"sid": client.claims.sid}))

    assert await client.conn.wait_closed() == errors.CLOSE_UNAUTHENTICATED
    await client.finished()
    assert env.pubsub.active_channels() == []


async def test_revoking_another_session_keeps_the_connection(env: Env) -> None:
    client = await connect(env)

    await revoke(env, SUB, json.dumps({"sid": "some-other-session"}))

    await assert_alive(client)


async def test_revoking_all_sessions_closes_with_4401(env: Env) -> None:
    client = await connect(env)

    await revoke(env, SUB, json.dumps({"sid": None}))

    assert await client.conn.wait_closed() == errors.CLOSE_UNAUTHENTICATED
    await client.finished()


async def test_invalid_json_on_the_revocation_channel_is_ignored(env: Env) -> None:
    client = await connect(env)

    await revoke(env, SUB, "not json at all")
    await revoke(env, SUB, "[]")

    await assert_alive(client)


async def test_revocation_of_another_user_does_not_affect_the_session(
    env: Env,
) -> None:
    client = await connect(env)
    assert client.claims is not None

    await revoke(env, "someone-else", json.dumps({"sid": client.claims.sid}))
    await revoke(env, "someone-else", json.dumps({"sid": None}))

    await assert_alive(client)


async def test_revocation_subscription_unavailable_closes_with_1013(env: Env) -> None:
    access, _, _ = await env.login()
    env.pubsub.fail()
    client = start(env)

    client.conn.feed_frame({"type": "auth", "token": access})

    assert await client.conn.wait_closed() == errors.CLOSE_TRY_AGAIN_LATER
    await client.finished()


# --- Redis errors (crit. 9, 11) -----------------------------------------------


async def test_subscribe_with_pubsub_down_is_an_error_frame_not_a_close(
    env: Env,
) -> None:
    client = await connect(env)
    env.pubsub.fail()

    reply = await request(client, {"type": "subscribe", "room": "sala-a", "id": "s1"})

    assert reply["type"] == "error"
    assert reply["payload"]["code"] == errors.PUBSUB_UNAVAILABLE
    assert reply["payload"]["status"] == 503
    assert reply["id"] == "s1"
    env.pubsub.fail(False)
    await assert_alive(client)


async def test_message_with_pubsub_down_is_an_error_frame_not_a_close(
    env: Env,
) -> None:
    client = await connect(env)
    await request(client, {"type": "subscribe", "room": "sala-a", "id": "s1"})
    env.pubsub.fail()

    reply = await request(
        client, {"type": "message", "room": "sala-a", "payload": {}, "id": "m1"}
    )

    assert reply["type"] == "error"
    assert reply["payload"]["code"] == errors.PUBSUB_UNAVAILABLE
    assert reply["payload"]["status"] == 503
    assert reply["id"] == "m1"
    env.pubsub.fail(False)
    await assert_alive(client)


async def test_subscribe_works_again_once_the_pubsub_is_back(env: Env) -> None:
    client = await connect(env)
    env.pubsub.fail()
    await request(client, {"type": "subscribe", "room": "sala-a", "id": "s1"})
    env.pubsub.fail(False)

    reply = await request(client, {"type": "subscribe", "room": "sala-a", "id": "s2"})

    assert pick(reply, "type", "room", "id") == {
        "type": "subscribe",
        "room": "sala-a",
        "id": "s2",
    }
    assert env.pubsub.subscriber_count(room_channel("sala-a")) == 1


async def test_a_subscription_failing_mid_connection_closes_with_1013(
    env: Env,
) -> None:
    client = await connect(env)
    await request(client, {"type": "subscribe", "room": "sala-a", "id": "s1"})

    env.pubsub.break_subscriptions()

    assert await client.conn.wait_closed() == errors.CLOSE_TRY_AGAIN_LATER
    await client.finished()
    assert env.pubsub.active_channels() == []


async def test_unexpected_error_closes_with_1011_and_does_not_propagate(
    env: Env, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG)
    client = await connect(env)
    env.pubsub.fail(error=RuntimeError("boom in the bus"))

    client.conn.feed_frame({"type": "subscribe", "room": "sala-a", "id": "s1"})

    assert await client.conn.wait_closed() == errors.CLOSE_INTERNAL_ERROR
    await client.finished()  # run() returned instead of raising
    assert client.task.exception() is None
    assert any(r.levelno >= logging.ERROR for r in caplog.records)
    assert client.token not in log_text(caplog)
    assert "boom in the bus" not in json.dumps(client.frames())


# --- cleanup ------------------------------------------------------------------


async def test_client_disconnect_ends_run_and_releases_every_subscription(
    env: Env,
) -> None:
    client = await connect(env)
    await request(client, {"type": "subscribe", "room": "sala-a", "id": "s1"})
    await request(client, {"type": "subscribe", "room": "sala-b", "id": "s2"})
    assert len(env.pubsub.active_channels()) == 3  # two rooms + revocation

    client.conn.disconnect()
    await client.finished()

    assert env.pubsub.active_channels() == []
    assert pending_tasks(env) == set()


async def test_run_leaves_no_pending_tasks_after_a_server_side_close(
    env: Env,
) -> None:
    client = await connect(env)
    await request(client, {"type": "subscribe", "room": "sala-a", "id": "s1"})
    assert client.claims is not None

    await revoke(env, SUB, json.dumps({"sid": client.claims.sid}))
    await client.finished()

    assert env.pubsub.active_channels() == []
    assert pending_tasks(env) == set()


# --- limits and hostile input (TG-63 review findings) -------------------------


def limits(**kwargs: Any) -> RealtimeConfig:
    return RealtimeConfig(auth_timeout_seconds=1.0, heartbeat_seconds=30.0, **kwargs)


def test_limits_default_to_twenty_rooms_and_64_kib_frames() -> None:
    config = RealtimeConfig(auth_timeout_seconds=1.0, heartbeat_seconds=30.0)

    assert config.max_rooms == 20
    assert config.max_frame_bytes == 65536


async def test_subscribing_past_max_rooms_is_rate_limited_and_keeps_the_connection(
    env: Env,
) -> None:
    client = await connect(env, config=limits(max_rooms=2))
    await request(client, {"type": "subscribe", "room": "sala-a", "id": "s1"})
    await request(client, {"type": "subscribe", "room": "sala-b", "id": "s2"})

    reply = await request(client, {"type": "subscribe", "room": "sala-c", "id": "s3"})

    assert reply["type"] == "error"
    assert reply["payload"]["code"] == errors.RATE_LIMITED
    assert reply["payload"]["status"] == 429
    assert reply["id"] == "s3"
    assert reply["room"] == "sala-c"
    assert env.pubsub.subscriber_count(room_channel("sala-c")) == 0
    await assert_alive(client)


async def test_resubscribing_to_a_joined_room_does_not_count_against_the_limit(
    env: Env,
) -> None:
    client = await connect(env, config=limits(max_rooms=2))
    await request(client, {"type": "subscribe", "room": "sala-a", "id": "s1"})
    await request(client, {"type": "subscribe", "room": "sala-b", "id": "s2"})

    reply = await request(client, {"type": "subscribe", "room": "sala-a", "id": "s4"})

    assert pick(reply, "type", "room", "id") == {
        "type": "subscribe",
        "room": "sala-a",
        "id": "s4",
    }
    assert env.pubsub.subscriber_count(room_channel("sala-a")) == 1


async def test_unsubscribing_frees_a_slot_for_a_new_room(env: Env) -> None:
    client = await connect(env, config=limits(max_rooms=2))
    await request(client, {"type": "subscribe", "room": "sala-a", "id": "s1"})
    await request(client, {"type": "subscribe", "room": "sala-b", "id": "s2"})
    await request(client, {"type": "unsubscribe", "room": "sala-a", "id": "u1"})

    reply = await request(client, {"type": "subscribe", "room": "sala-c", "id": "s3"})

    assert pick(reply, "type", "room", "id") == {
        "type": "subscribe",
        "room": "sala-c",
        "id": "s3",
    }
    await wait_until(lambda: env.pubsub.subscriber_count(room_channel("sala-c")) == 1)


def padded_ping(total_length: int) -> str:
    base = json.dumps({"type": "ping", "id": "b", "payload": {"p": ""}})
    pad = total_length - len(base)
    assert pad >= 0
    raw = json.dumps({"type": "ping", "id": "b", "payload": {"p": "x" * pad}})
    assert len(raw) == total_length
    return raw


async def test_a_frame_of_exactly_max_frame_bytes_is_accepted(env: Env) -> None:
    client = await connect(env, config=limits(max_frame_bytes=200))
    before = len(client.conn.sent)

    client.conn.feed(padded_ping(200))
    await client.conn.wait_for_sent(before + 1)

    assert pick(client.frames()[before], "type", "id") == {"type": "pong", "id": "b"}


async def test_an_oversized_frame_is_a_validation_error_and_is_not_published(
    env: Env,
) -> None:
    client = await connect(env, config=limits(max_frame_bytes=200))
    await request(client, {"type": "subscribe", "room": "sala-a", "id": "s1"})
    raw = json.dumps(
        {"type": "message", "room": "sala-a", "id": "m1", "payload": {"p": "x" * 300}}
    )
    before = len(client.conn.sent)

    client.conn.feed(raw)
    await client.conn.wait_for_sent(before + 1)

    reply = client.frames()[before]
    assert reply["type"] == "error"
    assert reply["payload"]["code"] == errors.VALIDATION_ERROR
    assert env.pubsub.published == []
    await assert_alive(client)


async def test_an_oversized_first_frame_closes_with_4401(env: Env) -> None:
    access, _, _ = await env.login()
    client = start(env, config=limits(max_frame_bytes=200))

    client.conn.feed(json.dumps({"type": "auth", "token": access, "pad": "x" * 300}))

    assert await client.conn.wait_closed() == errors.CLOSE_UNAUTHENTICATED
    assert client.conn.sent == []
    await client.finished()


@pytest.mark.parametrize("unit", ["[", '{"a":'])
async def test_deeply_nested_json_after_auth_is_a_validation_error(
    env: Env, unit: str, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG)
    client = await connect(env, config=limits(max_frame_bytes=10_000_000))
    before = len(client.conn.sent)

    client.conn.feed(unit * 100_000)
    await client.conn.wait_for_sent(before + 1)

    reply = client.frames()[before]
    assert reply["type"] == "error"
    assert reply["payload"]["code"] == errors.VALIDATION_ERROR
    assert not any(r.levelno >= logging.ERROR for r in caplog.records)
    await assert_alive(client)


@pytest.mark.parametrize("unit", ["[", '{"a":'])
async def test_deeply_nested_json_as_first_frame_closes_with_4401_without_logging(
    env: Env, unit: str, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG)
    client = start(env, config=limits(max_frame_bytes=10_000_000))

    client.conn.feed(unit * 100_000)

    assert await client.conn.wait_closed() == errors.CLOSE_UNAUTHENTICATED
    await client.finished()
    assert client.conn.sent == []
    assert not any(r.levelno >= logging.ERROR for r in caplog.records)


class ExpiringPubSub(FakePubSub):
    """Expires the access token the moment the revocation channel is subscribed."""

    def __init__(self, store: FlakySessionStore, jti: str) -> None:
        super().__init__()
        self._store = store
        self._jti = jti

    def subscribe(self, channel: str) -> AbstractAsyncContextManager[Any]:
        if channel == revocation_channel(SUB):
            self._store.expire(TokenType.ACCESS, self._jti)
        return super().subscribe(channel)


async def test_token_expiring_during_the_revocation_subscription_closes_with_4401(
    env: Env,
) -> None:
    access, _, claims = await env.login()
    env.pubsub = ExpiringPubSub(env.store, claims.jti)
    client = start(env, config=CONFIG)

    client.conn.feed_frame({"type": "auth", "token": access})

    # the heartbeat is 30 s: closing now means the token was re-checked
    assert await client.conn.wait_closed() == errors.CLOSE_UNAUTHENTICATED
    await client.finished()
    assert env.pubsub.active_channels() == []
