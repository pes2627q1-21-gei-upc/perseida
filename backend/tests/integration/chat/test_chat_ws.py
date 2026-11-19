"""Event chat over the WebSocket ``/api/ws``, PostgreSQL and Redis for real (TG-457).

Written first (TDD, ADR-0028): today any room is free (subscriptions are not
checked against the event subscriptions and a ``message`` is republished raw), so
these tests go through red and are the contract of TG-459. The wiring is not
assumed: the app is ``create_app()`` with its real lifespan, and the tests only
speak the protocol of ADR-0030 (frame ``{type, room?, payload, id}``, room
``chat:event:<event_id>``), so they do not depend on how the chat handler is
built or injected.

What the tests replace after the lifespan starts: the auth service (a fake Google
verifier over the real user accounts, session store and codec) and the Redis
client of the app, which goes through ``TcpProxy`` so that a test can make
``PUBLISH`` fail (pub/sub down) while the rest of Redis keeps working.

Rows are really committed (the app lives in the event loop of the
``TestClient``, so a rolled-back transaction cannot be shared with it). Each test
deletes what it created: events (their rooms, messages and subscriptions cascade),
identities and users; the module checks that the row counts are the same after.
The rate limit window is set to a few seconds (``CHAT_RATE_LIMIT_WINDOW_SECONDS``)
so that the test that waits for it to pass is short; that wait polls the Redis key
of the limiter instead of sleeping a fixed time.

Error codes fixed by these tests for the WebSocket (as frames ``error`` whose
``payload.code`` is the domain code unchanged): ``CHAT_MESSAGE_EMPTY``,
``CHAT_MESSAGE_TOO_LONG``, ``FORBIDDEN``, ``RATE_LIMITED``, ``PUBSUB_UNAVAILABLE``
and ``VALIDATION_ERROR`` for a payload without a ``text`` string.
"""

import asyncio
import os
import time
import uuid
from collections.abc import Iterator
from contextlib import ExitStack
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, cast
from uuid import uuid4

import pytest
from alembic.config import Config
from fastapi.testclient import TestClient
from redis.asyncio import Redis
from sqlalchemy import bindparam, text
from sqlalchemy.ext.asyncio import create_async_engine
from starlette.testclient import WebSocketTestSession

from alembic import command
from app.application.auth.auth_service import AuthService, SessionDurations
from app.application.realtime.realtime_session import RealtimeConfig
from app.domain.auth.models import GoogleIdentity
from app.infrastructure.auth.jwt_codec import JwtTokenCodec
from app.infrastructure.auth.redis_session_store import RedisSessionStore
from app.infrastructure.cache.config import RedisSettings
from app.infrastructure.cache.redis_pubsub import RedisPubSub
from app.infrastructure.chat.dependencies import get_chat_settings
from app.infrastructure.persistence.config import DatabaseSettings
from app.infrastructure.scheduler.dependencies import get_scheduler_settings
from app.infrastructure.users.account_gateway import UserAccountGateway
from app.main import create_app
from tests.fakes.auth import FakeGoogleTokenVerifier
from tests.integration.isolation import row_counts
from tests.integration.test_websocket_redis import TcpProxy

pytestmark = pytest.mark.skipif(
    not (os.getenv("POSTGRES_HOST") and os.getenv("REDIS_HOST")),
    reason="PostgreSQL and Redis integration test requires their hosts",
)

URL = "/api/ws"
JWT_SECRET = "s" * 40
SOCKET_TIMEOUT_SECONDS = 1.0
RATE_LIMIT_WINDOW_SECONDS = 3
RATE_LIMIT_MESSAGES = 10
MESSAGE_KEYS = {"id", "room_id", "author_id", "text", "sent_at"}

INSERT_EVENT = text(
    "INSERT INTO astronomical_events"
    " (id, source, external_id, title, summary, category, starts_at, ends_at)"
    " VALUES (:id, 'catalog', :external_id, :title, 'An astronomical event.',"
    " 'lunar', :starts_at, :ends_at)"
)
INSERT_SUBSCRIPTION = text(
    "INSERT INTO event_subscriptions (id, user_id, event_id, created_at)"
    " VALUES (:id, :user_id, :event_id, :created_at)"
)
USER_OF = text(
    "SELECT user_id FROM user_identities WHERE provider = 'google' AND subject = :sub"
)
DELETE_EVENTS = text("DELETE FROM astronomical_events WHERE id IN :ids").bindparams(
    bindparam("ids", expanding=True)
)
USERS_OF = text(
    "SELECT user_id FROM user_identities WHERE subject IN :subs"
).bindparams(bindparam("subs", expanding=True))
DELETE_IDENTITIES = text(
    "DELETE FROM user_identities WHERE subject IN :subs"
).bindparams(bindparam("subs", expanding=True))
DELETE_USERS = text("DELETE FROM users WHERE id IN :ids").bindparams(
    bindparam("ids", expanding=True)
)


@pytest.fixture(scope="module", autouse=True)
def _schema_at_head() -> None:
    backend_dir = Path(__file__).resolve().parents[3]
    config = Config(str(backend_dir / "alembic.ini"))
    config.set_main_option("script_location", str(backend_dir / "alembic"))
    config.attributes["configure_logger"] = False
    command.upgrade(config, "head")


@pytest.fixture(scope="module", autouse=True)
def _preexisting_data_is_kept(_schema_at_head: None) -> Iterator[None]:
    before = row_counts()
    yield
    assert row_counts() == before


@pytest.fixture(autouse=True)
def _environment(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setenv("SCHEDULER_ENABLED", "false")
    monkeypatch.setenv("GOOGLE_CLIENT_IDS", "test.apps.googleusercontent.com")
    monkeypatch.setenv("JWT_SECRET", JWT_SECRET)
    monkeypatch.setenv("NASA_API_KEY", "chat-ws-test-key")
    monkeypatch.setenv("CHAT_RATE_LIMIT_MESSAGES", str(RATE_LIMIT_MESSAGES))
    monkeypatch.setenv("CHAT_RATE_LIMIT_WINDOW_SECONDS", str(RATE_LIMIT_WINDOW_SECONDS))
    get_scheduler_settings.cache_clear()
    get_chat_settings.cache_clear()
    yield
    get_scheduler_settings.cache_clear()
    get_chat_settings.cache_clear()


@pytest.fixture
def proxy() -> Iterator[TcpProxy]:
    settings = RedisSettings()
    relay = TcpProxy(settings.redis_host, settings.redis_port)
    relay.start()
    try:
        yield relay
    finally:
        relay.stop()


def sql(statement: Any, params: dict[str, Any] | list[dict[str, Any]]) -> list[Any]:
    """Run one statement in its own transaction (and event loop); return its rows."""

    async def run() -> list[Any]:
        engine = create_async_engine(DatabaseSettings().database_url)
        try:
            async with engine.begin() as connection:
                result = await connection.execute(statement, params)
                return list(result.all()) if result.returns_rows else []
        finally:
            await engine.dispose()

    return asyncio.run(run())


class Harness:
    """The app with its real lifespan plus helpers to log in, seed and connect."""

    def __init__(self, client: TestClient, proxy: TcpProxy) -> None:
        self.client = client
        self.proxy = proxy
        self.state = client.app.state  # type: ignore[attr-defined]
        self.subs: list[str] = []
        self.events: list[uuid.UUID] = []
        self.users: dict[str, uuid.UUID] = {}
        self.tokens: dict[str, str] = {}
        self.run_id = uuid4().hex[:12]
        # The app reaches Redis through the proxy; ``direct`` is for the checks.
        self.via_proxy = Redis.from_url(
            f"redis://127.0.0.1:{proxy.port}",
            decode_responses=True,
            socket_connect_timeout=SOCKET_TIMEOUT_SECONDS,
            socket_timeout=SOCKET_TIMEOUT_SECONDS,
        )
        self.direct = Redis.from_url(RedisSettings().redis_url, decode_responses=True)
        self.state.redis = self.via_proxy
        self.state.realtime_config = RealtimeConfig(
            auth_timeout_seconds=2.0, heartbeat_seconds=60
        )
        self.state.auth_service = self.auth_service(
            FakeGoogleTokenVerifier(
                GoogleIdentity(google_sub="unused", email="u@example.test")
            )
        )

    def auth_service(self, verifier: FakeGoogleTokenVerifier) -> AuthService:
        return AuthService(
            verifier,
            JwtTokenCodec(JWT_SECRET),
            RedisSessionStore(self.via_proxy, RedisPubSub(self.via_proxy)),
            UserAccountGateway(self.state.user_service),
            SessionDurations(access_seconds=900, refresh_seconds=3600),
        )

    def call(self, func: Any, *args: Any) -> Any:
        return self.client.portal.call(func, *args)  # type: ignore[union-attr]

    def login(self, name: str) -> str:
        """Create (or reuse) the user ``name``; return its access token."""
        sub = f"it-ws-{name}-{self.run_id}"
        service = self.auth_service(
            FakeGoogleTokenVerifier(
                GoogleIdentity(google_sub=sub, email=f"{sub}@example.test", name=name)
            )
        )
        access = str(self.call(service.login, "google-id-token").access_token)
        self.subs.append(sub)
        self.users[name] = sql(USER_OF, {"sub": sub})[0][0]
        self.tokens[name] = access
        return access

    def event(self, *subscribers: str) -> uuid.UUID:
        """A new event in two days, with the given (logged in) users subscribed."""
        event_id = uuid.uuid7()
        starts_at = datetime.now(UTC) + timedelta(days=2)
        sql(
            INSERT_EVENT,
            {
                "id": event_id,
                "external_id": f"it-chat-ws-{event_id}",
                "title": f"Event {event_id}",
                "starts_at": starts_at,
                "ends_at": starts_at + timedelta(hours=2),
            },
        )
        self.events.append(event_id)
        for name in subscribers:
            sql(
                INSERT_SUBSCRIPTION,
                {
                    "id": uuid.uuid7(),
                    "user_id": self.users[name],
                    "event_id": event_id,
                    "created_at": datetime.now(UTC),
                },
            )
        return event_id

    def connect(self, name: str, stack: ExitStack) -> WebSocketTestSession:
        ws = stack.enter_context(self.client.websocket_connect(URL))
        ws.send_json({"type": "auth", "token": self.tokens[name]})
        assert ws.receive_json() == {"type": "auth", "payload": {}}
        return ws

    @staticmethod
    def join(ws: WebSocketTestSession, room: str) -> None:
        ws.send_json({"type": "subscribe", "room": room, "id": "s"})
        assert ws.receive_json() == {
            "type": "subscribe",
            "room": room,
            "id": "s",
            "payload": {},
        }

    @staticmethod
    def assert_alive(ws: WebSocketTestSession) -> None:
        """Ping/pong: every earlier frame of the socket has been delivered."""
        probe = uuid4().hex
        ws.send_json({"type": "ping", "id": probe})
        assert ws.receive_json() == {"type": "pong", "id": probe, "payload": {}}

    @staticmethod
    def send(
        ws: WebSocketTestSession, room: str, payload: dict[str, Any], frame_id: str
    ) -> dict[str, Any]:
        """Send a ``message`` frame; return the first frame the sender receives."""
        # every message carries the id the client made up (TG-654)
        payload = {"client_message_id": str(uuid4()), **payload}
        ws.send_json(
            {"type": "message", "room": room, "id": frame_id, "payload": payload}
        )
        frame: dict[str, Any] = ws.receive_json()
        return frame

    def history(self, name: str, event_id: uuid.UUID) -> list[dict[str, Any]]:
        response = self.client.get(
            f"/api/events/{event_id}/chat/messages",
            headers={"Authorization": f"Bearer {self.tokens[name]}"},
        )
        assert response.status_code == 200
        messages: list[dict[str, Any]] = response.json()["messages"]
        return messages

    async def _purge_redis(self) -> None:
        for name in self.users:
            await self.direct.delete(f"ratelimit:chat:{self.users[name]}")
        for sub in self.subs:
            index = f"user_sessions:{sub}"
            for member in cast(set[str], await self.direct.smembers(index)):
                _, kind, jti = member.split(":", 2)
                await self.direct.delete(f"session:{kind}:{jti}")
            await self.direct.delete(index)
        await self.direct.aclose()
        await self.via_proxy.aclose()

    def wait_until_window_passes(self, name: str) -> None:
        key = f"ratelimit:chat:{self.users[name]}"
        deadline = time.monotonic() + RATE_LIMIT_WINDOW_SECONDS + 2
        while self.call(self.direct.exists, key):
            assert time.monotonic() < deadline, "the rate limit window never ended"
            time.sleep(0.1)

    def cleanup(self) -> None:
        self.proxy.resume()
        self.proxy.drop_publish = False
        self.call(self._purge_redis)
        if self.events:
            sql(DELETE_EVENTS, {"ids": self.events})
        if self.subs:
            ids = [row[0] for row in sql(USERS_OF, {"subs": self.subs})]
            sql(DELETE_IDENTITIES, {"subs": self.subs})
            if ids:
                sql(DELETE_USERS, {"ids": ids})


@pytest.fixture
def harness(proxy: TcpProxy) -> Iterator[Harness]:
    with TestClient(create_app()) as client:
        env = Harness(client, proxy)
        try:
            yield env
        finally:
            env.cleanup()


def room_of(event_id: uuid.UUID) -> str:
    return f"chat:event:{event_id}"


def assert_error(
    frame: dict[str, Any], code: str, frame_id: str, room: str | None = None
) -> None:
    assert frame["type"] == "error"
    assert frame["id"] == frame_id
    if room is not None:
        assert frame["room"] == room
    assert frame["payload"]["code"] == code


# --- messages between the subscribers of an event ------------------------------


def test_tg457_a_message_reaches_the_other_subscriber_and_the_sender_gets_an_ack(
    harness: Harness,
) -> None:
    harness.login("ana")
    harness.login("bob")
    event_id = harness.event("ana", "bob")
    room = room_of(event_id)
    with ExitStack() as stack:
        sender = harness.connect("ana", stack)
        listener = harness.connect("bob", stack)
        harness.join(sender, room)
        harness.join(listener, room)

        ack = harness.send(sender, room, {"text": "Hola, cel clar!"}, "m1")
        received = listener.receive_json()

        assert received["type"] == "message"
        assert received["room"] == room
        dto = received["payload"]
        assert set(dto) == MESSAGE_KEYS
        assert dto["text"] == "Hola, cel clar!"
        assert dto["author_id"] == str(harness.users["ana"])
        assert uuid.UUID(dto["id"]).version == 7
        assert datetime.fromisoformat(dto["sent_at"]).tzinfo is not None
        # the ack is the frame of the sender (same id and room), with the
        # server's id and timestamp of the stored message
        assert ack["type"] == "message"
        assert ack["id"] == "m1"
        assert ack["room"] == room
        assert ack["payload"]["id"] == dto["id"]
        assert ack["payload"]["sent_at"] == dto["sent_at"]
        harness.assert_alive(sender)  # no echo of its own message after the ack
        harness.assert_alive(listener)  # and no duplicate for the listener


def test_tg457_the_text_is_cleaned_and_the_limit_is_1000_characters(
    harness: Harness,
) -> None:
    harness.login("ana")
    harness.login("bob")
    event_id = harness.event("ana", "bob")
    room = room_of(event_id)
    with ExitStack() as stack:
        sender = harness.connect("ana", stack)
        listener = harness.connect("bob", stack)
        harness.join(sender, room)
        harness.join(listener, room)

        harness.send(sender, room, {"text": "  hola  "}, "m1")
        cleaned = listener.receive_json()
        harness.send(sender, room, {"text": "x" * 1000}, "m2")
        longest = listener.receive_json()

        assert cleaned["payload"]["text"] == "hola"
        assert longest["payload"]["text"] == "x" * 1000


def test_tg457_a_client_in_the_room_of_another_event_receives_nothing(
    harness: Harness,
) -> None:
    harness.login("ana")
    harness.login("bob")
    harness.login("eva")
    event_id = harness.event("ana", "bob")
    other_event = harness.event("eva")
    room = room_of(event_id)
    with ExitStack() as stack:
        sender = harness.connect("ana", stack)
        listener = harness.connect("bob", stack)
        outsider = harness.connect("eva", stack)
        harness.join(sender, room)
        harness.join(listener, room)
        harness.join(outsider, room_of(other_event))

        harness.send(sender, room, {"text": "nomes per a l'esdeveniment"}, "m1")

        assert (
            listener.receive_json()["payload"]["text"] == "nomes per a l'esdeveniment"
        )
        harness.assert_alive(outsider)  # a message for it would arrive first


# --- permissions ---------------------------------------------------------------


def test_tg457_subscribing_without_a_subscription_to_the_event_is_forbidden(
    harness: Harness,
) -> None:
    harness.login("ana")
    harness.login("mallory")
    event_id = harness.event("ana")
    room = room_of(event_id)
    with ExitStack() as stack:
        intruder = harness.connect("mallory", stack)

        intruder.send_json({"type": "subscribe", "room": room, "id": "s1"})
        error = intruder.receive_json()

        assert_error(error, "FORBIDDEN", "s1", room)
        harness.assert_alive(intruder)  # the connection stays open


def test_tg457_a_forbidden_client_gets_no_messages_even_after_trying_to_join(
    harness: Harness,
) -> None:
    harness.login("ana")
    harness.login("bob")
    harness.login("mallory")
    event_id = harness.event("ana", "bob")
    room = room_of(event_id)
    with ExitStack() as stack:
        sender = harness.connect("ana", stack)
        listener = harness.connect("bob", stack)
        intruder = harness.connect("mallory", stack)
        harness.join(sender, room)
        harness.join(listener, room)
        intruder.send_json({"type": "subscribe", "room": room, "id": "s1"})
        assert_error(intruder.receive_json(), "FORBIDDEN", "s1", room)

        harness.send(sender, room, {"text": "privat"}, "m1")

        assert listener.receive_json()["payload"]["text"] == "privat"
        harness.assert_alive(intruder)  # nothing was delivered to it


def test_tg457_a_message_from_a_user_not_subscribed_to_the_event_is_forbidden(
    harness: Harness,
) -> None:
    harness.login("ana")
    harness.login("bob")
    harness.login("mallory")
    event_id = harness.event("ana", "bob")
    room = room_of(event_id)
    with ExitStack() as stack:
        listener = harness.connect("bob", stack)
        intruder = harness.connect("mallory", stack)
        harness.join(listener, room)

        reply = harness.send(intruder, room, {"text": "intrus"}, "m1")

        assert_error(reply, "FORBIDDEN", "m1", room)
        harness.assert_alive(intruder)
        harness.assert_alive(listener)  # nothing was delivered
        assert harness.history("ana", event_id) == []  # and nothing was stored


def test_tg457_a_message_without_a_previous_subscribe_is_not_subscribed(
    harness: Harness,
) -> None:
    harness.login("ana")
    harness.login("bob")
    event_id = harness.event("ana", "bob")
    room = room_of(event_id)
    with ExitStack() as stack:
        listener = harness.connect("bob", stack)
        sender = harness.connect("ana", stack)  # subscribed to the event, not joined
        harness.join(listener, room)

        reply = harness.send(sender, room, {"text": "hola"}, "m1")

        assert_error(reply, "NOT_SUBSCRIBED", "m1", room)
        harness.assert_alive(sender)
        harness.assert_alive(listener)  # nothing was delivered
        assert harness.history("ana", event_id) == []  # and nothing was stored


# --- leaving the event (TG-459) ------------------------------------------------


def test_tg459_leaving_the_event_by_rest_drops_the_room_of_the_open_sockets(
    harness: Harness,
) -> None:
    harness.login("ana")
    harness.login("bob")
    harness.login("carol")
    event_id = harness.event("ana", "bob", "carol")
    other_event = harness.event("ana")
    room, other_room = room_of(event_id), room_of(other_event)
    with ExitStack() as stack:
        leaver = harness.connect("ana", stack)
        sender = harness.connect("bob", stack)
        stayer = harness.connect("carol", stack)
        for ws in (leaver, sender, stayer):
            harness.join(ws, room)
        harness.join(leaver, other_room)
        sent = harness.send(sender, room, {"text": "abans"}, "m1")
        assert sent["type"] == "message"
        assert leaver.receive_json()["payload"]["text"] == "abans"
        assert stayer.receive_json()["payload"]["text"] == "abans"

        response = harness.client.delete(
            f"/api/events/{event_id}/subscription",
            headers={"Authorization": f"Bearer {harness.tokens['ana']}"},
        )

        assert response.status_code == 204
        assert leaver.receive_json() == {
            "type": "unsubscribe",
            "room": room,
            "payload": {},
        }
        harness.send(sender, room, {"text": "despres"}, "m2")
        assert stayer.receive_json()["payload"]["text"] == "despres"  # others: yes
        harness.assert_alive(leaver)  # the socket lives and got nothing else
        harness.assert_alive(sender)
        # no longer a subscriber of the event: the handler refuses before
        # the generic NOT_SUBSCRIBED
        refused = harness.send(leaver, room, {"text": "intrus"}, "m3")
        assert_error(refused, "FORBIDDEN", "m3", room)
        # another room of the same socket is untouched
        harness.send(leaver, other_room, {"text": "segueixo"}, "m4")
        assert harness.history("ana", other_event)[0]["text"] == "segueixo"
        # the history lists the newest first; the refused message is not there
        assert [m["text"] for m in harness.history("bob", event_id)] == [
            "despres",
            "abans",
        ]


# --- validation ----------------------------------------------------------------


@pytest.mark.parametrize(
    ("text", "code"),
    [
        ("", "CHAT_MESSAGE_EMPTY"),
        ("   ", "CHAT_MESSAGE_EMPTY"),
        ("\n\t ", "CHAT_MESSAGE_EMPTY"),
        ("x" * 1001, "CHAT_MESSAGE_TOO_LONG"),
    ],
    ids=["empty", "spaces", "whitespace", "too-long"],
)
def test_tg457_an_empty_or_too_long_text_gets_the_domain_code_and_is_not_sent(
    harness: Harness, text: str, code: str
) -> None:
    harness.login("ana")
    harness.login("bob")
    event_id = harness.event("ana", "bob")
    room = room_of(event_id)
    with ExitStack() as stack:
        sender = harness.connect("ana", stack)
        listener = harness.connect("bob", stack)
        harness.join(sender, room)
        harness.join(listener, room)

        reply = harness.send(sender, room, {"text": text}, "m1")

        assert_error(reply, code, "m1", room)
        harness.assert_alive(sender)  # the connection stays open
        harness.assert_alive(listener)  # nothing was delivered
        assert harness.history("ana", event_id) == []  # nor stored


@pytest.mark.parametrize(
    "payload",
    [{}, {"text": 5}, {"text": None}, {"text": ["hola"]}, {"body": "hola"}],
    ids=["no-payload", "number", "null", "list", "other-key"],
)
def test_tg457_a_payload_without_a_text_string_is_a_validation_error(
    harness: Harness, payload: dict[str, Any]
) -> None:
    harness.login("ana")
    harness.login("bob")
    event_id = harness.event("ana", "bob")
    room = room_of(event_id)
    with ExitStack() as stack:
        sender = harness.connect("ana", stack)
        listener = harness.connect("bob", stack)
        harness.join(sender, room)
        harness.join(listener, room)

        reply = harness.send(sender, room, payload, "m1")

        assert_error(reply, "VALIDATION_ERROR", "m1", room)
        harness.assert_alive(sender)
        harness.assert_alive(listener)
        assert harness.history("ana", event_id) == []


# --- rate limit ----------------------------------------------------------------


def test_tg457_the_eleventh_message_in_the_window_is_rate_limited_and_it_recovers(
    harness: Harness,
) -> None:
    harness.login("ana")
    harness.login("bob")
    event_id = harness.event("ana", "bob")
    room = room_of(event_id)
    with ExitStack() as stack:
        sender = harness.connect("ana", stack)
        listener = harness.connect("bob", stack)
        harness.join(sender, room)
        harness.join(listener, room)

        for index in range(RATE_LIMIT_MESSAGES):
            ack = harness.send(sender, room, {"text": f"m{index}"}, f"m{index}")
            assert ack["type"] == "message"
            assert listener.receive_json()["payload"]["text"] == f"m{index}"
        limited = harness.send(sender, room, {"text": "una de massa"}, "m10")

        assert_error(limited, "RATE_LIMITED", "m10", room)
        harness.assert_alive(sender)  # the connection stays open
        harness.assert_alive(listener)  # the eleventh was not delivered
        assert len(harness.history("ana", event_id)) == RATE_LIMIT_MESSAGES

        harness.wait_until_window_passes("ana")
        again = harness.send(sender, room, {"text": "ja puc"}, "m11")

        assert again["type"] == "message"
        assert again["id"] == "m11"
        assert listener.receive_json()["payload"]["text"] == "ja puc"


# --- history -------------------------------------------------------------------


def test_tg457_a_message_sent_over_the_websocket_appears_in_the_rest_history(
    harness: Harness,
) -> None:
    harness.login("ana")
    harness.login("bob")
    event_id = harness.event("ana", "bob")
    room = room_of(event_id)
    with ExitStack() as stack:
        sender = harness.connect("ana", stack)
        harness.join(sender, room)

        ack = harness.send(sender, room, {"text": "per a l'historic"}, "m1")

        # even a user who was not connected reads it
        stored = harness.history("bob", event_id)
        assert [message["id"] for message in stored] == [ack["payload"]["id"]]
        assert stored[0]["text"] == "per a l'historic"
        assert stored[0]["author_id"] == str(harness.users["ana"])
        assert stored[0]["sent_at"] == ack["payload"]["sent_at"]


# --- Redis pub/sub down --------------------------------------------------------


def test_tg457_with_pubsub_down_the_error_is_controlled_and_the_message_is_stored(
    harness: Harness,
) -> None:
    harness.login("ana")
    harness.login("bob")
    event_id = harness.event("ana", "bob")
    room = room_of(event_id)
    with ExitStack() as stack:
        sender = harness.connect("ana", stack)
        listener = harness.connect("bob", stack)
        harness.join(sender, room)
        harness.join(listener, room)

        harness.proxy.drop_publish = True
        reply = harness.send(sender, room, {"text": "es desa igualment"}, "m1")

        assert_error(reply, "PUBSUB_UNAVAILABLE", "m1", room)
        harness.assert_alive(sender)  # the connection is not closed
        harness.assert_alive(listener)
        harness.proxy.drop_publish = False
        assert [m["text"] for m in harness.history("ana", event_id)] == [
            "es desa igualment"
        ]

        harness.send(sender, room, {"text": "ja torna"}, "m2")
        assert listener.receive_json()["payload"]["text"] == "ja torna"


# --- isolation between clients ---------------------------------------------------


def test_tg457_an_error_of_one_client_does_not_affect_the_others(
    harness: Harness,
) -> None:
    harness.login("ana")
    harness.login("bob")
    harness.login("cris")
    harness.login("mallory")
    event_id = harness.event("ana", "bob", "cris")
    room = room_of(event_id)
    with ExitStack() as stack:
        sender = harness.connect("ana", stack)
        listener = harness.connect("bob", stack)
        clumsy = harness.connect("cris", stack)
        intruder = harness.connect("mallory", stack)
        for ws in (sender, listener, clumsy):
            harness.join(ws, room)

        assert_error(
            harness.send(clumsy, room, {"text": ""}, "e1"), "CHAT_MESSAGE_EMPTY", "e1"
        )
        intruder.send_json({"type": "subscribe", "room": room, "id": "e2"})
        assert_error(intruder.receive_json(), "FORBIDDEN", "e2", room)
        harness.send(sender, room, {"text": "tot be"}, "m1")

        assert listener.receive_json()["payload"]["text"] == "tot be"
        assert clumsy.receive_json()["payload"]["text"] == "tot be"
        harness.assert_alive(clumsy)  # the clumsy client can still talk
        harness.send(clumsy, room, {"text": "ara be"}, "m2")
        assert listener.receive_json()["payload"]["text"] == "ara be"
        harness.assert_alive(intruder)


# --- TG-654: idempotent send (client_message_id) --------------------------------


def test_tg654_an_identical_retry_gets_the_same_ack_and_is_stored_once(
    harness: Harness,
) -> None:
    harness.login("ana")
    harness.login("bob")
    event_id = harness.event("ana", "bob")
    room = room_of(event_id)
    key = str(uuid4())
    with ExitStack() as stack:
        sender = harness.connect("ana", stack)
        listener = harness.connect("bob", stack)
        harness.join(sender, room)
        harness.join(listener, room)

        first = harness.send(
            sender, room, {"text": "Hola", "client_message_id": key}, "m1"
        )
        original = listener.receive_json()
        retry = harness.send(
            sender, room, {"text": " Hola ", "client_message_id": key}, "m2"
        )
        republished = listener.receive_json()

        assert first["type"] == retry["type"] == "message"
        assert retry["id"] == "m2"
        assert retry["payload"] == first["payload"]  # same id and sent_at
        # republished: the others may have missed the first broadcast
        assert republished["payload"] == original["payload"]
        harness.assert_alive(sender)
        harness.assert_alive(listener)
        assert [m["id"] for m in harness.history("ana", event_id)] == [
            first["payload"]["id"]
        ]


def test_tg654_an_identical_retry_does_not_count_towards_the_rate_limit(
    harness: Harness,
) -> None:
    harness.login("ana")
    event_id = harness.event("ana")
    room = room_of(event_id)
    key = str(uuid4())
    with ExitStack() as stack:
        sender = harness.connect("ana", stack)
        harness.join(sender, room)

        replies = [
            harness.send(
                sender, room, {"text": "Hola", "client_message_id": key}, f"r{n}"
            )
            for n in range(25)  # well above the limit of messages per window
        ]

        assert {r["type"] for r in replies} == {"message"}
        assert {r["payload"]["id"] for r in replies} == {replies[0]["payload"]["id"]}


def test_tg654_the_same_key_with_another_text_is_a_409_conflict(
    harness: Harness,
) -> None:
    harness.login("ana")
    event_id = harness.event("ana")
    room = room_of(event_id)
    key = str(uuid4())
    with ExitStack() as stack:
        sender = harness.connect("ana", stack)
        harness.join(sender, room)
        first = harness.send(
            sender, room, {"text": "Hola", "client_message_id": key}, "m1"
        )

        reply = harness.send(
            sender, room, {"text": "Un altre", "client_message_id": key}, "m2"
        )

        assert_error(reply, "CHAT_IDEMPOTENCY_CONFLICT", "m2", room)
        assert reply["payload"]["status"] == 409
        harness.assert_alive(sender)
        assert [m["id"] for m in harness.history("ana", event_id)] == [
            first["payload"]["id"]
        ]


@pytest.mark.parametrize(
    "client_message_id",
    [None, 5, "not-a-uuid", str(uuid4()).upper(), uuid4().hex],
    ids=["null", "number", "text", "upper-case", "no-hyphens"],
)
def test_tg654_a_non_canonical_client_message_id_is_a_validation_error(
    harness: Harness, client_message_id: object
) -> None:
    harness.login("ana")
    event_id = harness.event("ana")
    room = room_of(event_id)
    with ExitStack() as stack:
        sender = harness.connect("ana", stack)
        harness.join(sender, room)

        reply = harness.send(
            sender,
            room,
            {"text": "Hola", "client_message_id": client_message_id},
            "m1",
        )

        assert_error(reply, "VALIDATION_ERROR", "m1", room)
        harness.assert_alive(sender)
        assert harness.history("ana", event_id) == []


def test_tg654_a_message_without_client_message_id_is_a_validation_error(
    harness: Harness,
) -> None:
    harness.login("ana")
    event_id = harness.event("ana")
    room = room_of(event_id)
    with ExitStack() as stack:
        sender = harness.connect("ana", stack)
        harness.join(sender, room)
        # bypass ``Harness.send``, which adds an id when the payload has none
        sender.send_json(
            {"type": "message", "room": room, "id": "m1", "payload": {"text": "Hola"}}
        )

        reply = sender.receive_json()

        assert_error(reply, "VALIDATION_ERROR", "m1", room)
        assert harness.history("ana", event_id) == []
