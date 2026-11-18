"""Port of the rooms whose rules live outside the generic session (TG-459).

``RealtimeSession`` only knows frames, rooms and pub/sub. A feature that needs
its own rules for a family of rooms (who may join, what a ``message`` means, how
it is stored and fanned out) registers a ``RoomHandler`` under a room prefix
(``chat:event:``); the rooms without handler behave as plain rooms.

A handler signals a refusal by raising a ``DomainError`` or an
``ApplicationError``; the session turns it into a frame ``error`` with the same
``code`` and keeps the connection open.
"""

from dataclasses import dataclass
from typing import Any, Protocol


@dataclass(frozen=True)
class RoomRequest:
    """Who asks what: the user (``sub`` of the token), the connection and the room."""

    sub: str
    conn_id: str
    room: str


class RoomHandler(Protocol):
    async def subscribe(self, request: RoomRequest) -> None:
        """Allow (return) or refuse (raise) joining the room."""

    async def unsubscribe(self, request: RoomRequest) -> None:
        """Leaving never needs permission; it may still reject a malformed room."""

    async def message(
        self, request: RoomRequest, payload: dict[str, Any]
    ) -> dict[str, Any]:
        """Handle a ``message``; the return value is the payload of its ack.

        The handler fans the message out itself (with ``request.conn_id`` as
        origin, so that the sender's session does not echo it).
        """
