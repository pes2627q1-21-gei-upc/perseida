"""Fake room handler for the real-time session (TG-459)."""

from typing import Any

from app.application.realtime.room_handler import RoomRequest


class FakeRoomHandler:
    """Records every call; ``failure`` (if set) is raised by the next calls."""

    def __init__(self, ack: dict[str, Any] | None = None) -> None:
        self.ack = ack if ack is not None else {"stored": True}
        self.failure: Exception | None = None
        self.subscribed: list[RoomRequest] = []
        self.unsubscribed: list[RoomRequest] = []
        self.messages: list[tuple[RoomRequest, dict[str, Any]]] = []

    async def subscribe(self, request: RoomRequest) -> None:
        self.subscribed.append(request)
        if self.failure is not None:
            raise self.failure

    async def unsubscribe(self, request: RoomRequest) -> None:
        self.unsubscribed.append(request)
        if self.failure is not None:
            raise self.failure

    async def message(
        self, request: RoomRequest, payload: dict[str, Any]
    ) -> dict[str, Any]:
        self.messages.append((request, payload))
        if self.failure is not None:
            raise self.failure
        return self.ack
