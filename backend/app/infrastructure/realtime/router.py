import logging
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, WebSocket
from starlette.websockets import WebSocketDisconnect, WebSocketState

from app.application.auth.auth_service import AuthService
from app.application.realtime.realtime_session import RealtimeConfig, RealtimeSession
from app.domain.auth.ports import SessionStore
from app.domain.realtime.ports import ConnectionClosed
from app.domain.shared.ports import PubSub
from app.infrastructure.auth.dependencies import get_auth_service, get_session_store
from app.infrastructure.cache.dependencies import get_pubsub
from app.infrastructure.realtime.dependencies import get_realtime_config

logger = logging.getLogger(__name__)

CLOSE_UNSUPPORTED_DATA = 1003

router = APIRouter(tags=["realtime"])


class WebSocketConnection:
    """Adapts Starlette's ``WebSocket`` to the domain ``RealtimeConnection`` port."""

    def __init__(self, websocket: WebSocket) -> None:
        self._ws = websocket

    async def receive_text(self) -> str:
        try:
            return await self._ws.receive_text()
        except (WebSocketDisconnect, RuntimeError) as exc:
            raise ConnectionClosed from exc
        except (KeyError, TypeError) as exc:  # Starlette on a binary frame
            await self.close(CLOSE_UNSUPPORTED_DATA)
            raise ConnectionClosed from exc

    async def send_text(self, data: str) -> None:
        try:
            await self._ws.send_text(data)
        except (WebSocketDisconnect, RuntimeError) as exc:
            raise ConnectionClosed from exc

    async def close(self, code: int) -> None:
        if self._ws.application_state == WebSocketState.DISCONNECTED:
            return
        try:
            await self._ws.close(code)
        except RuntimeError:
            logger.debug("WebSocket already closed")


# The token travels in the first frame (never in the URL or a header), so this
# route has no bearer dependency; RealtimeSession authenticates it.
@router.websocket("/ws")
async def realtime_endpoint(
    websocket: WebSocket,
    auth: Annotated[AuthService, Depends(get_auth_service)],
    store: Annotated[SessionStore, Depends(get_session_store)],
    pubsub: Annotated[PubSub, Depends(get_pubsub)],
    config: Annotated[RealtimeConfig, Depends(get_realtime_config)],
) -> None:
    await websocket.accept()
    conn_id = str(uuid4())
    # the correlation middleware binds the id of the handshake to the connection
    correlation_id = getattr(websocket.state, "correlation_id", None)
    session = RealtimeSession(
        WebSocketConnection(websocket),
        auth,
        store,
        pubsub,
        config,
        conn_id,
        correlation_id if isinstance(correlation_id, str) else None,
    )
    await session.run()
