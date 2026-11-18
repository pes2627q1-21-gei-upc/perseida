from collections.abc import Mapping
from typing import Annotated

from fastapi import Depends
from starlette.requests import HTTPConnection

from app.application.realtime.connection_limiter import ConnectionLimiter
from app.application.realtime.realtime_session import RealtimeConfig
from app.application.realtime.room_handler import RoomHandler
from app.infrastructure.chat.dependencies import ChatServiceDep
from app.infrastructure.chat.ws_handler import CHAT_ROOM_PREFIX, ChatWsHandler
from app.infrastructure.users.dependencies import UserServiceDep


def get_realtime_config(conn: HTTPConnection) -> RealtimeConfig:
    config: RealtimeConfig = conn.app.state.realtime_config
    return config


def get_connection_limiter(
    conn: HTTPConnection,
    config: Annotated[RealtimeConfig, Depends(get_realtime_config)],
) -> ConnectionLimiter:
    """The limiter shared by every connection of the app, built on first use."""
    state = conn.app.state
    limiter: ConnectionLimiter | None = getattr(state, "connection_limiter", None)
    if limiter is None:
        limiter = ConnectionLimiter(config.max_connections_per_user)
        state.connection_limiter = limiter
    return limiter


def get_room_handlers(
    chat: ChatServiceDep, users: UserServiceDep
) -> Mapping[str, RoomHandler]:
    """The handlers of the rooms by prefix, built for each connection.

    A WebSocket has no per-request ``Depends`` after the handshake, so the
    endpoint resolves them once, over the resources of the app (``state``).
    """
    return {CHAT_ROOM_PREFIX: ChatWsHandler(chat, users)}
