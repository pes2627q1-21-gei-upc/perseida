from typing import Protocol


class ConnectionClosed(Exception):  # noqa: N818  (name fixed by the port contract)
    """The peer is gone or the connection was already closed."""


class RealtimeConnection(Protocol):
    """Server side of one real-time (WebSocket) connection, as text frames."""

    async def receive_text(self) -> str:
        """Return the next text message from the client.

        Raises:
            ConnectionClosed: if the connection is closed.
        """
        ...

    async def send_text(self, data: str) -> None:
        """Send a text message to the client.

        Raises:
            ConnectionClosed: if the connection is closed.
        """
        ...

    async def close(self, code: int) -> None:
        """Close the connection with the given close code (idempotent)."""
        ...
