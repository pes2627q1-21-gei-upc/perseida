"""WebSocket endpoint /api/ws (US #63) through Starlette's TestClient.

One ``with TestClient`` shares a single event loop between connections, so the
in-memory fake bus can fan out between them. Every wait is a client receive
(it blocks until the server acts); the config timeouts are the only clock.
"""

import json
import logging
from collections.abc import Iterator
from contextlib import ExitStack
from typing import Any

import pytest
from app.infrastructure.realtime.dependencies import get_realtime_config
from app.infrastructure.realtime.router import router
from fastapi import FastAPI
from fastapi.routing import APIWebSocketRoute
from fastapi.testclient import TestClient
from starlette.testclient import WebSocketTestSession
from starlette.websockets import WebSocketDisconnect

from app.application.auth.auth_service import AuthService, SessionDurations
from app.application.realtime.realtime_session import RealtimeConfig
from app.domain.auth.models import GoogleIdentity
from app.domain.realtime.models import revocation_channel
from app.infrastructure.auth.dependencies import get_auth_service, get_session_store
from app.infrastructure.cache.dependencies import get_pubsub
from tests.fakes.auth import (
    FakeAccountGateway,
    FakeGoogleTokenVerifier,
    FakeTokenCodec,
    InMemorySessionStore,
)
from tests.fakes.pubsub import FakePubSub

URL = "/api/ws"
SUB = "g-realtime"
CONFIG = RealtimeConfig(auth_timeout_seconds=0.3, heartbeat_seconds=60)


class Env:
    def __init__(self) -> None:
        self.pubsub = FakePubSub()
        self.store = InMemorySessionStore()
        self.codec = FakeTokenCodec()
        self.config = CONFIG
        self.service = AuthService(
            FakeGoogleTokenVerifier(GoogleIdentity(google_sub=SUB, email="a@x.org")),
            self.codec,
            self.store,
            FakeAccountGateway(),
            SessionDurations(access_seconds=900, refresh_seconds=3600),
        )


@pytest.fixture
def env() -> Env:
    return Env()


@pytest.fixture
async def token(env: Env) -> str:
    return (await env.service.login("google-id-token")).access_token


@pytest.fixture
def client(env: Env) -> Iterator[TestClient]:
    app = FastAPI()
    app.include_router(router, prefix="/api")
    app.dependency_overrides[get_auth_service] = lambda: env.service
    app.dependency_overrides[get_pubsub] = lambda: env.pubsub
    app.dependency_overrides[get_session_store] = lambda: env.store
    app.dependency_overrides[get_realtime_config] = lambda: env.config
    with TestClient(app) as test_client:
        yield test_client


def authed(client: TestClient, token: str, stack: ExitStack) -> WebSocketTestSession:
    ws = stack.enter_context(client.websocket_connect(URL))
    ws.send_json({"type": "auth", "token": token})
    assert ws.receive_json() == {"type": "auth", "payload": {}}
    return ws


def test_the_handshake_needs_no_query_parameter_nor_header(
    client: TestClient,
) -> None:
    # TG-63 criteri 1: the bare URL is accepted (the server waits for the auth frame)
    with client.websocket_connect(URL) as ws:
        ws.send_json({"type": "ping", "id": "x"})  # not an auth frame
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_json()

    assert exc.value.code == 4401


def test_a_valid_token_in_the_first_frame_is_acknowledged(
    client: TestClient, token: str
) -> None:
    # TG-63 criteri 2
    with client.websocket_connect(URL) as ws:
        ws.send_json({"type": "auth", "token": token})

        assert ws.receive_json() == {"type": "auth", "payload": {}}


def test_an_invalid_token_closes_with_4401(client: TestClient) -> None:
    # TG-63 criteri 2
    with client.websocket_connect(URL) as ws:
        ws.send_json({"type": "auth", "token": "nope"})
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_json()

    assert exc.value.code == 4401


def test_a_first_frame_that_is_not_auth_closes_with_4401(client: TestClient) -> None:
    # TG-63 criteri 2
    with client.websocket_connect(URL) as ws:
        ws.send_json({"type": "subscribe", "room": "chat:1"})
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_json()

    assert exc.value.code == 4401


def test_no_first_frame_in_time_closes_with_4401(client: TestClient) -> None:
    # TG-63 criteri 3
    with client.websocket_connect(URL) as ws, pytest.raises(WebSocketDisconnect) as exc:
        ws.receive_json()

    assert exc.value.code == 4401


def test_the_token_never_reaches_the_logs_nor_the_url(
    client: TestClient, token: str, caplog: pytest.LogCaptureFixture
) -> None:
    # TG-63 criteri 4
    caplog.set_level(logging.DEBUG)
    assert "?" not in URL
    with client.websocket_connect(URL) as ws:
        ws.send_json({"type": "auth", "token": token})
        ws.receive_json()
        ws.send_json({"type": "ping", "id": "p"})
        ws.receive_json()

    assert token not in caplog.text


def test_a_message_reaches_the_other_subscribers_of_the_room_only(
    client: TestClient, token: str
) -> None:
    # TG-63 criteris 5 i 6
    with ExitStack() as stack:
        sender = authed(client, token, stack)
        listener = authed(client, token, stack)
        outsider = authed(client, token, stack)
        for ws, room in (
            (sender, "chat:1"),
            (listener, "chat:1"),
            (outsider, "chat:2"),
        ):
            ws.send_json({"type": "subscribe", "room": room, "id": "s"})
            assert ws.receive_json()["type"] == "subscribe"

        sender.send_json(
            {"type": "message", "room": "chat:1", "id": "m1", "payload": {"t": "hi"}}
        )

        assert sender.receive_json()["type"] == "message"  # the sender's own ack
        received = listener.receive_json()
        assert received["type"] == "message"
        assert received["room"] == "chat:1"
        assert received["payload"] == {"t": "hi"}
        outsider.send_json({"type": "ping", "id": "after"})
        assert outsider.receive_json() == {"type": "pong", "id": "after", "payload": {}}


def test_an_invalid_frame_gets_an_error_and_the_socket_stays_open(
    client: TestClient, token: str
) -> None:
    # TG-63 criteri 7
    with ExitStack() as stack:
        ws = authed(client, token, stack)
        ws.send_text("{not json")
        error = ws.receive_json()
        ws.send_json({"type": "ping", "id": "still"})

        assert error["type"] == "error"
        assert error["payload"]["code"] == "VALIDATION_ERROR"
        assert ws.receive_json()["type"] == "pong"


def test_a_ping_is_answered_with_a_pong(client: TestClient, token: str) -> None:
    # TG-63 criteri 8
    with ExitStack() as stack:
        ws = authed(client, token, stack)
        ws.send_json({"type": "ping", "id": "p1"})

        assert ws.receive_json() == {"type": "pong", "id": "p1", "payload": {}}


def test_an_unavailable_bus_is_reported_as_pubsub_unavailable(
    client: TestClient, token: str, env: Env
) -> None:
    # TG-63 criteri 11
    with ExitStack() as stack:
        ws = authed(client, token, stack)
        env.pubsub.fail(True)
        ws.send_json({"type": "subscribe", "room": "chat:1", "id": "s"})

        error = ws.receive_json()

    assert error["type"] == "error"
    assert error["payload"]["code"] == "PUBSUB_UNAVAILABLE"


def test_revoking_the_session_closes_the_socket_with_4401(
    client: TestClient, token: str, env: Env
) -> None:
    # TG-63 criteri 10
    sid = env.codec.issued[token].sid
    with ExitStack() as stack:
        ws = authed(client, token, stack)
        client.portal.call(  # type: ignore[union-attr]
            env.pubsub.publish, revocation_channel(SUB), json.dumps({"sid": sid})
        )
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_json()

    assert exc.value.code == 4401


def test_revoking_another_session_keeps_the_socket_open(
    client: TestClient, token: str, env: Env
) -> None:
    # TG-63 criteri 10
    with ExitStack() as stack:
        ws = authed(client, token, stack)
        client.portal.call(  # type: ignore[union-attr]
            env.pubsub.publish, revocation_channel(SUB), json.dumps({"sid": "other"})
        )
        ws.send_json({"type": "ping", "id": "alive"})

        assert ws.receive_json()["type"] == "pong"


def test_the_application_mounts_the_websocket_under_api_ws() -> None:
    from app.main import create_app

    routes: list[Any] = create_app().routes

    ws_routes = [r for r in routes if getattr(r, "path", None) == "/api/ws"]
    assert len(ws_routes) == 1
    assert isinstance(ws_routes[0], APIWebSocketRoute)
