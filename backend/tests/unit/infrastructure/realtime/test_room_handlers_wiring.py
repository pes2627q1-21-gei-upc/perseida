"""Where the room handlers come from and how /api/ws gives them to the session.

TG-459.
"""

import uuid
from collections.abc import Iterator
from contextlib import ExitStack
from types import SimpleNamespace
from typing import cast
from unittest.mock import MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.requests import HTTPConnection

from app.application.auth.auth_service import AuthService, SessionDurations
from app.application.chat.chat_service import ChatService
from app.application.realtime.realtime_session import RealtimeConfig
from app.application.realtime.room_handler import RoomHandler
from app.application.users.user_service import UserService
from app.domain.auth.models import GoogleIdentity
from app.infrastructure.api.correlation import CorrelationIdMiddleware
from app.infrastructure.auth.dependencies import get_auth_service, get_session_store
from app.infrastructure.cache.dependencies import get_pubsub
from app.infrastructure.chat.config import ChatSettings
from app.infrastructure.chat.dependencies import get_chat_service
from app.infrastructure.chat.ws_handler import CHAT_ROOM_PREFIX, ChatWsHandler
from app.infrastructure.realtime.dependencies import (
    get_realtime_config,
    get_room_handlers,
)
from app.infrastructure.realtime.router import router
from tests.fakes.auth import (
    FakeAccountGateway,
    FakeGoogleTokenVerifier,
    FakeTokenCodec,
    InMemorySessionStore,
)
from tests.fakes.chat import ChatFakes
from tests.fakes.pubsub import FakePubSub
from tests.fakes.room_handler import FakeRoomHandler
from tests.fakes.users import InMemoryUserRepository

URL = "/api/ws"


def test_the_chat_handler_is_registered_under_the_prefix_of_the_chat_rooms() -> None:
    fakes = ChatFakes()

    handlers = get_room_handlers(
        ChatService(fakes, fakes, fakes, fakes, fakes),
        UserService(InMemoryUserRepository()),
    )

    assert list(handlers) == [CHAT_ROOM_PREFIX]
    assert isinstance(handlers[CHAT_ROOM_PREFIX], ChatWsHandler)


def test_the_handlers_are_built_with_the_chat_service_of_the_app() -> None:
    state = SimpleNamespace(session_factory=MagicMock(), redis=MagicMock())
    conn = cast(HTTPConnection, SimpleNamespace(app=SimpleNamespace(state=state)))

    service = get_chat_service(conn, ChatSettings())

    assert isinstance(
        get_room_handlers(service, UserService(InMemoryUserRepository()))[
            CHAT_ROOM_PREFIX
        ],
        ChatWsHandler,
    )


@pytest.fixture
def client() -> Iterator[tuple[TestClient, FakeRoomHandler, str]]:
    codec = FakeTokenCodec()
    store = InMemorySessionStore()
    auth = AuthService(
        FakeGoogleTokenVerifier(GoogleIdentity(google_sub="g-1", email="a@x.org")),
        codec,
        store,
        FakeAccountGateway(),
        SessionDurations(access_seconds=900, refresh_seconds=3600),
    )
    handler = FakeRoomHandler(ack={"ok": True})
    pubsub = FakePubSub()
    app = FastAPI()
    app.add_middleware(CorrelationIdMiddleware)
    app.include_router(router, prefix="/api")
    app.dependency_overrides[get_auth_service] = lambda: auth
    app.dependency_overrides[get_pubsub] = lambda: pubsub
    app.dependency_overrides[get_session_store] = lambda: store
    app.dependency_overrides[get_realtime_config] = lambda: RealtimeConfig(
        auth_timeout_seconds=1, heartbeat_seconds=60
    )
    handlers: dict[str, RoomHandler] = {"talk:": handler}
    app.dependency_overrides[get_room_handlers] = lambda: handlers
    with TestClient(app) as test_client:
        token = test_client.portal.call(auth.login, "google-id-token")  # type: ignore[union-attr]
        yield test_client, handler, token.access_token


def test_the_endpoint_hands_the_registered_handlers_to_the_session(
    client: tuple[TestClient, FakeRoomHandler, str],
) -> None:
    test_client, handler, token = client
    with ExitStack() as stack:
        ws = stack.enter_context(test_client.websocket_connect(URL))
        ws.send_json({"type": "auth", "token": token})
        assert ws.receive_json() == {"type": "auth", "payload": {}}

        ws.send_json({"type": "message", "room": "talk:1", "id": "m", "payload": {}})
        reply = ws.receive_json()

    assert reply == {
        "type": "message",
        "room": "talk:1",
        "id": "m",
        "payload": {"ok": True},
    }
    [(request, _)] = handler.messages
    assert uuid.UUID(request.conn_id)  # the id the endpoint gives to the connection
    assert request.sub  # the user of the access token
