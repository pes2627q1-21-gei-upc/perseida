"""WebSocket /api/ws (US #63, task #429) against a real Redis.

The app is a minimal one of the test: the real router, a real ``AuthService``
(JWT codec, ``RedisSessionStore`` publishing the revocation, ``RedisPubSub``) and
a Redis client created in the lifespan, so it lives in the event loop of the
``TestClient`` (a single ``with`` shares that loop between connections).

The app reaches Redis through ``TcpProxy``, a tiny TCP relay that the tests can
sever and resume to simulate Redis going down. Every wait is a blocking receive
of the client; the only clock is the short timeouts of the app configuration.
"""

import asyncio
import json
import os
import threading
from collections.abc import AsyncIterator, Iterator
from contextlib import ExitStack, asynccontextmanager
from typing import Any, cast
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from redis.asyncio import Redis
from starlette.testclient import WebSocketTestSession
from starlette.websockets import WebSocketDisconnect

from app.application.auth.auth_service import AuthService, SessionDurations
from app.application.realtime.realtime_session import RealtimeConfig
from app.application.shared.errors import ExternalServiceError
from app.domain.auth.models import GoogleIdentity, TokenType
from app.domain.realtime.models import revocation_channel, room_channel
from app.infrastructure.auth.jwt_codec import JwtTokenCodec
from app.infrastructure.auth.redis_session_store import RedisSessionStore
from app.infrastructure.cache.config import RedisSettings
from app.infrastructure.cache.redis_pubsub import RedisPubSub
from app.infrastructure.realtime.router import router
from tests.fakes.auth import FakeAccountGateway, FakeGoogleTokenVerifier

pytestmark = pytest.mark.skipif(
    not os.getenv("REDIS_HOST"),
    reason="Redis integration tests require REDIS_HOST",
)

URL = "/api/ws"
JWT_SECRET = "test-secret-for-websocket-redis-tests-0123456789"
CONFIG = RealtimeConfig(auth_timeout_seconds=2.0, heartbeat_seconds=60)
SOCKET_TIMEOUT_SECONDS = 1.0
CLOSE_UNAUTHENTICATED = 4401
CLOSE_TRY_AGAIN_LATER = 1013


class TcpProxy:
    """TCP relay in front of Redis, in its own thread and event loop.

    ``block`` stops accepting connections but keeps the open ones; ``cut`` also
    severs them; ``resume`` listens again on the same port. With ``drop_publish``
    a connection that sends ``PUBLISH`` is closed before Redis sees the command.
    """

    def __init__(self, host: str, port: int) -> None:
        self._target = (host, port)
        self.drop_publish = False
        self.port = 0
        self._loop = asyncio.new_event_loop()
        self._server: asyncio.Server | None = None
        self._writers: set[asyncio.StreamWriter] = set()
        self._thread = threading.Thread(target=self._loop.run_forever, daemon=True)

    def start(self) -> None:
        self._thread.start()
        self._run(self._listen(0))

    def stop(self) -> None:
        self._run(self._cut())
        self._loop.call_soon_threadsafe(self._loop.stop)
        self._thread.join(timeout=5)
        self._loop.close()

    def block(self) -> None:
        self._run(self._close_server())

    def cut(self) -> None:
        self._run(self._cut())

    def resume(self) -> None:
        self._run(self._listen(self.port))

    def _run(self, coro: Any) -> None:
        asyncio.run_coroutine_threadsafe(coro, self._loop).result(timeout=10)

    async def _listen(self, port: int) -> None:
        if self._server is not None:
            return
        self._server = await asyncio.start_server(self._handle, "127.0.0.1", port)
        self.port = self._server.sockets[0].getsockname()[1]

    async def _close_server(self) -> None:
        if self._server is not None:
            self._server.close()
            self._server = None

    async def _cut(self) -> None:
        await self._close_server()
        for writer in list(self._writers):
            writer.close()
        self._writers.clear()

    async def _handle(
        self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter
    ) -> None:
        try:
            up_reader, up_writer = await asyncio.open_connection(*self._target)
        except OSError:
            writer.close()
            return
        self._writers.update((writer, up_writer))
        await asyncio.gather(
            self._pump(reader, up_writer, upstream=True),
            self._pump(up_reader, writer, upstream=False),
            return_exceptions=True,
        )
        for end in (writer, up_writer):
            end.close()
            self._writers.discard(end)

    async def _pump(
        self, source: asyncio.StreamReader, sink: asyncio.StreamWriter, upstream: bool
    ) -> None:
        try:
            while data := await source.read(65536):
                if upstream and self.drop_publish and b"PUBLISH" in data.upper():
                    break
                sink.write(data)
                await sink.drain()
        except OSError:
            pass
        finally:
            sink.close()


@pytest.fixture
def proxy() -> Iterator[TcpProxy]:
    settings = RedisSettings()
    relay = TcpProxy(settings.redis_host, settings.redis_port)
    relay.start()
    try:
        yield relay
    finally:
        relay.stop()


class Harness:
    def __init__(self, client: TestClient, proxy: TcpProxy) -> None:
        self.client = client
        self.proxy = proxy
        self.state = client.app.state  # type: ignore[attr-defined]
        self.subs: set[str] = set()

    def call(self, func: Any, *args: Any) -> Any:
        return self.client.portal.call(func, *args)  # type: ignore[union-attr]

    def login(self, sub: str) -> str:
        """A new session (new ``sid``) of ``sub``; returns its access token."""
        self.subs.add(sub)
        service = AuthService(
            FakeGoogleTokenVerifier(GoogleIdentity(google_sub=sub, email="a@x.org")),
            self.state.codec,
            self.state.store,
            FakeAccountGateway(),
            SessionDurations(access_seconds=900, refresh_seconds=3600),
        )
        return str(self.call(service.login, "google-id-token").access_token)

    def connect(self, token: str, stack: ExitStack) -> WebSocketTestSession:
        ws = stack.enter_context(self.client.websocket_connect(URL))
        ws.send_json({"type": "auth", "token": token})
        assert ws.receive_json() == {"type": "auth", "payload": {}}
        return ws

    def join(self, ws: WebSocketTestSession, room: str) -> None:
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
    def assert_closed(ws: WebSocketTestSession, code: int) -> None:
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_json()
        assert exc.value.code == code

    def sid_of(self, token: str) -> str:
        return str(self.state.codec.decode(token).sid)

    async def purge(self) -> None:
        direct: Redis = self.state.direct_redis
        for sub in self.subs:
            index = f"user_sessions:{sub}"
            for member in cast(set[str], await direct.smembers(index)):
                _, kind, jti = member.split(":", 2)
                await direct.delete(f"session:{kind}:{jti}")
            await direct.delete(index)


def build_app(proxy: TcpProxy) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        settings = RedisSettings()
        redis = Redis.from_url(
            f"redis://127.0.0.1:{proxy.port}",
            decode_responses=True,
            socket_connect_timeout=SOCKET_TIMEOUT_SECONDS,
            socket_timeout=SOCKET_TIMEOUT_SECONDS,
        )
        direct = Redis.from_url(settings.redis_url, decode_responses=True)
        codec = JwtTokenCodec(JWT_SECRET)
        store = RedisSessionStore(redis, RedisPubSub(redis))
        app.state.redis = redis
        app.state.direct_redis = direct
        app.state.codec = codec
        app.state.store = store
        app.state.realtime_config = CONFIG
        app.state.auth_service = AuthService(
            FakeGoogleTokenVerifier(
                GoogleIdentity(google_sub="unused", email="u@x.org")
            ),
            codec,
            store,
            FakeAccountGateway(),
            SessionDurations(access_seconds=900, refresh_seconds=3600),
        )
        try:
            yield
        finally:
            await direct.aclose()
            await redis.aclose()

    app = FastAPI(lifespan=lifespan)
    app.include_router(router, prefix="/api")
    return app


@pytest.fixture
def harness(proxy: TcpProxy) -> Iterator[Harness]:
    with TestClient(build_app(proxy)) as client:
        env = Harness(client, proxy)
        try:
            yield env
        finally:
            proxy.resume()
            env.call(env.purge)


@pytest.fixture
def sub() -> str:
    return f"test-{uuid4().hex}"


@pytest.fixture
def room() -> str:
    return f"chat:{uuid4().hex}"


# --- messages between clients ---------------------------------------------


def test_a_message_reaches_the_other_subscriber_of_the_room_only(
    harness: Harness, sub: str, room: str
) -> None:
    # TG-63 criteris 5 i 6
    with ExitStack() as stack:
        sender = harness.connect(harness.login(sub), stack)
        listener = harness.connect(harness.login(f"{sub}-b"), stack)
        outsider = harness.connect(harness.login(f"{sub}-c"), stack)
        harness.join(sender, room)
        harness.join(listener, room)
        harness.join(outsider, f"{room}-other")

        sender.send_json(
            {"type": "message", "room": room, "id": "m1", "payload": {"t": "hi"}}
        )

        assert sender.receive_json() == {
            "type": "message",
            "room": room,
            "id": "m1",
            "payload": {},
        }
        assert listener.receive_json() == {
            "type": "message",
            "room": room,
            "id": "m1",
            "payload": {"t": "hi"},
        }
        harness.assert_alive(outsider)  # a message for it would arrive first
        harness.assert_alive(sender)  # no echo of its own message


def test_subscribing_twice_to_a_room_does_not_duplicate_messages(
    harness: Harness, sub: str, room: str
) -> None:
    # TG-63 criteri 5
    with ExitStack() as stack:
        sender = harness.connect(harness.login(sub), stack)
        listener = harness.connect(harness.login(f"{sub}-b"), stack)
        harness.join(sender, room)
        harness.join(listener, room)
        harness.join(listener, room)

        sender.send_json({"type": "message", "room": room, "id": "m1"})
        sender.receive_json()

        assert listener.receive_json()["id"] == "m1"
        harness.assert_alive(listener)  # a duplicate would be received first


# --- revocation ------------------------------------------------------------


def test_logout_closes_only_the_websocket_of_that_session(
    harness: Harness, sub: str
) -> None:
    # TG-63 criteri 10
    first = harness.login(sub)
    second = harness.login(sub)
    other_user = harness.login(f"{sub}-other")
    with ExitStack() as stack:
        revoked = harness.connect(first, stack)
        same_user = harness.connect(second, stack)
        another = harness.connect(other_user, stack)
        service: AuthService = harness.state.auth_service

        harness.call(service.logout, first)

        harness.assert_closed(revoked, CLOSE_UNAUTHENTICATED)
        harness.assert_alive(same_user)
        harness.assert_alive(another)
        assert harness.sid_of(first) != harness.sid_of(second)


def test_revoking_all_the_sessions_closes_every_connection_of_the_user(
    harness: Harness, sub: str
) -> None:
    # TG-63 criteri 10
    with ExitStack() as stack:
        sockets = [
            harness.connect(harness.login(sub), stack),
            harness.connect(harness.login(sub), stack),
        ]
        another = harness.connect(harness.login(f"{sub}-other"), stack)

        harness.call(harness.state.store.revoke_all, sub)

        for ws in sockets:
            harness.assert_closed(ws, CLOSE_UNAUTHENTICATED)
        harness.assert_alive(another)


def test_a_revoked_token_cannot_open_a_new_websocket(
    harness: Harness, sub: str
) -> None:
    # TG-63 criteris 2 i 10
    token = harness.login(sub)
    harness.call(harness.state.auth_service.logout, token)

    with harness.client.websocket_connect(URL) as ws:
        ws.send_json({"type": "auth", "token": token})
        harness.assert_closed(ws, CLOSE_UNAUTHENTICATED)


# --- Redis down ------------------------------------------------------------


def test_subscribing_with_redis_down_reports_an_error_and_recovers(
    harness: Harness, sub: str, room: str
) -> None:
    # TG-63 criteri 11
    with ExitStack() as stack:
        victim = harness.connect(harness.login(sub), stack)
        bystander = harness.connect(harness.login(f"{sub}-b"), stack)
        harness.join(bystander, room)

        # No new connection to Redis; the open ones (the bystander's) stay.
        harness.proxy.block()
        harness.call(harness.state.redis.connection_pool.disconnect, False)
        victim.send_json({"type": "subscribe", "room": room, "id": "s1"})
        error = victim.receive_json()

        assert error["type"] == "error"
        assert error["id"] == "s1"
        assert error["payload"]["code"] == "PUBSUB_UNAVAILABLE"
        harness.assert_alive(victim)  # not closed
        harness.assert_alive(bystander)
        envelope = {"from": "outside", "frame": {"type": "message", "room": room}}
        harness.call(
            harness.state.direct_redis.publish, room_channel(room), json.dumps(envelope)
        )
        assert bystander.receive_json() == {
            "type": "message",
            "room": room,
            "payload": {},
        }

        harness.proxy.resume()
        harness.join(victim, room)
        victim.send_json({"type": "message", "room": room, "id": "m2"})
        victim.receive_json()
        assert bystander.receive_json()["id"] == "m2"


def test_a_connection_cut_in_the_middle_closes_with_1013(
    harness: Harness, sub: str, room: str
) -> None:
    # TG-63 criteri 11
    with ExitStack() as stack:
        ws = harness.connect(harness.login(sub), stack)
        harness.join(ws, room)

        harness.proxy.cut()

        harness.assert_closed(ws, CLOSE_TRY_AGAIN_LATER)


def test_a_revocation_with_redis_down_raises_session_unavailable(
    harness: Harness, sub: str
) -> None:
    # Existing contract of the store (TG-63 does not change it): the session
    # state is unknown, so the failure reaches the caller.
    token = harness.login(sub)

    harness.proxy.cut()

    with pytest.raises(ExternalServiceError) as exc:
        harness.call(harness.state.auth_service.logout, token)
    assert exc.value.code == "SESSION_UNAVAILABLE"


def test_a_failed_announcement_does_not_stop_the_revocation(
    harness: Harness, sub: str
) -> None:
    # Contract of RedisSessionStore: if Redis answered the deletion, a failed
    # PUBLISH is logged and not raised; the heartbeat closes the socket later.
    token = harness.login(sub)
    claims = harness.state.codec.decode(token)
    key = f"session:{TokenType.ACCESS.value}:{claims.jti}"
    direct: Redis = harness.state.direct_redis
    assert harness.call(direct.exists, key) == 1
    with ExitStack() as stack:
        ws = harness.connect(token, stack)

        harness.proxy.drop_publish = True
        harness.call(harness.state.auth_service.logout, token)  # does not raise

        assert harness.call(direct.exists, key) == 0
        harness.assert_alive(ws)  # nobody announced it
        harness.proxy.drop_publish = False
        harness.call(
            direct.publish,
            revocation_channel(sub),
            json.dumps({"sid": claims.sid}),
        )
        harness.assert_closed(ws, CLOSE_UNAUTHENTICATED)
