from typing import Annotated

from fastapi import Depends
from starlette.requests import HTTPConnection

from app.application.realtime.connection_limiter import ConnectionLimiter
from app.application.realtime.realtime_session import RealtimeConfig


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
