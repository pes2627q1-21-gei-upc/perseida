from typing import Any, cast
from unittest.mock import AsyncMock, MagicMock

import pytest
from starlette.websockets import WebSocketDisconnect, WebSocketState

from app.domain.realtime.ports import ConnectionClosed
from app.infrastructure.realtime.router import WebSocketConnection


def make_connection(
    state: WebSocketState = WebSocketState.CONNECTED,
) -> tuple[WebSocketConnection, MagicMock]:
    websocket = MagicMock()
    websocket.application_state = state
    websocket.receive_text = AsyncMock()
    websocket.send_text = AsyncMock()
    websocket.close = AsyncMock()
    return WebSocketConnection(cast(Any, websocket)), websocket


@pytest.mark.parametrize("failure", [WebSocketDisconnect(1000), RuntimeError("closed")])
async def test_receive_text_maps_a_closed_socket_to_connection_closed(
    failure: Exception,
) -> None:
    connection, websocket = make_connection()
    websocket.receive_text.side_effect = failure

    with pytest.raises(ConnectionClosed):
        await connection.receive_text()


@pytest.mark.parametrize("failure", [WebSocketDisconnect(1006), RuntimeError("closed")])
async def test_send_text_maps_a_closed_socket_to_connection_closed(
    failure: Exception,
) -> None:
    connection, websocket = make_connection()
    websocket.send_text.side_effect = failure

    with pytest.raises(ConnectionClosed):
        await connection.send_text("{}")


async def test_close_forwards_the_code() -> None:
    connection, websocket = make_connection()

    await connection.close(4401)

    websocket.close.assert_awaited_once_with(4401)


async def test_close_does_nothing_when_the_client_already_left() -> None:
    connection, websocket = make_connection(WebSocketState.DISCONNECTED)

    await connection.close(4401)

    websocket.close.assert_not_awaited()


async def test_close_ignores_a_socket_closed_in_the_meantime() -> None:
    connection, websocket = make_connection()
    websocket.close.side_effect = RuntimeError("already closed")

    await connection.close(1011)
