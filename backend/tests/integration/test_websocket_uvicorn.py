"""``/api/ws`` served by a real uvicorn (US #63).

Starlette's TestClient speaks ASGI directly, so it never notices a missing
WebSocket library: uvicorn then answers the handshake with a 404. This test
sends the raw upgrade request to a running server, as nginx-proxy-manager does.
"""

import base64
import os
import socket
import threading
import time
from collections.abc import Iterator

import pytest
import uvicorn
from fastapi import FastAPI
from websockets.exceptions import ConnectionClosedError
from websockets.sync.client import connect

from app.application.auth.auth_service import AuthService, SessionDurations
from app.application.realtime.realtime_session import RealtimeConfig
from app.domain.auth.models import GoogleIdentity
from app.infrastructure.auth.dependencies import get_auth_service, get_session_store
from app.infrastructure.cache.dependencies import get_pubsub
from app.infrastructure.realtime.dependencies import get_realtime_config
from app.infrastructure.realtime.router import router
from tests.fakes.auth import (
    FakeAccountGateway,
    FakeGoogleTokenVerifier,
    FakeTokenCodec,
    InMemorySessionStore,
)
from tests.fakes.pubsub import FakePubSub

LOCALHOST = "127.0.0.1"


def _build_app() -> FastAPI:
    store = InMemorySessionStore()
    service = AuthService(
        FakeGoogleTokenVerifier(GoogleIdentity(google_sub="g-1", email="a@x.org")),
        FakeTokenCodec(),
        store,
        FakeAccountGateway(),
        SessionDurations(access_seconds=900, refresh_seconds=3600),
    )
    pubsub = FakePubSub()
    config = RealtimeConfig(auth_timeout_seconds=5, heartbeat_seconds=60)
    app = FastAPI()
    app.include_router(router, prefix="/api")
    app.dependency_overrides[get_auth_service] = lambda: service
    app.dependency_overrides[get_pubsub] = lambda: pubsub
    app.dependency_overrides[get_session_store] = lambda: store
    app.dependency_overrides[get_realtime_config] = lambda: config
    return app


@pytest.fixture
def port() -> Iterator[int]:
    with socket.socket() as probe:
        probe.bind((LOCALHOST, 0))
        free_port: int = probe.getsockname()[1]
    server = uvicorn.Server(
        uvicorn.Config(
            _build_app(),
            host=LOCALHOST,
            port=free_port,
            log_level="error",
            ws_max_size=65536,
        )
    )
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    deadline = time.monotonic() + 5
    while not server.started and time.monotonic() < deadline:
        time.sleep(0.01)
    assert server.started, "uvicorn did not start"
    try:
        yield free_port
    finally:
        server.should_exit = True
        thread.join(timeout=5)


def test_a_real_uvicorn_switches_the_handshake_to_a_websocket(port: int) -> None:
    key = base64.b64encode(os.urandom(16)).decode()
    request = (
        "GET /api/ws HTTP/1.1\r\n"
        f"Host: {LOCALHOST}:{port}\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        f"Sec-WebSocket-Key: {key}\r\n"
        "Sec-WebSocket-Version: 13\r\n\r\n"
    )

    with socket.create_connection((LOCALHOST, port), timeout=5) as client:
        client.sendall(request.encode())
        status_line = client.recv(1024).split(b"\r\n", 1)[0].decode()

    assert status_line == "HTTP/1.1 101 Switching Protocols"


def test_oversized_first_message_is_rejected_by_real_uvicorn(port: int) -> None:
    with connect(f"ws://{LOCALHOST}:{port}/api/ws") as client:
        client.send("x" * 65537)
        with pytest.raises(ConnectionClosedError) as exc:
            client.recv()
        assert exc.value.rcvd is not None
        assert exc.value.rcvd.code == 1009
