"""Chat rooms of the WebSocket (``chat:event:<event_id>``), TG-459.

Adapts ``ChatService`` to the ``RoomHandler`` port of ``RealtimeSession``: the
room names the event, the user is the ``sub`` of the session and the service
owns the rules (subscription to the event, rate limit, moderation, storage and
fan-out). Its errors travel unchanged to the session, which turns them into
frames ``error``.
"""

import uuid
from typing import Any

from app.application.chat.chat_service import ChatService
from app.application.realtime.errors import FORBIDDEN, VALIDATION_ERROR
from app.application.realtime.room_handler import RoomRequest
from app.application.shared.errors import ForbiddenError
from app.domain.shared.errors import ValidationError

CHAT_ROOM_PREFIX = "chat:event:"


def _event_of(room: str) -> uuid.UUID:
    """The event of a chat room; only the canonical form of a UUID is accepted.

    Another spelling (no hyphens, upper case) would name a room nobody publishes
    to, so its subscriber would wait for messages that never come.
    """
    suffix = room.removeprefix(CHAT_ROOM_PREFIX)
    try:
        event_id = uuid.UUID(suffix)
    except ValueError:
        raise ValidationError(
            VALIDATION_ERROR, "Invalid event id in the room."
        ) from None
    if str(event_id) != suffix:
        raise ValidationError(VALIDATION_ERROR, "Invalid event id in the room.")
    return event_id


def _user_of(request: RoomRequest) -> uuid.UUID:
    try:
        return uuid.UUID(request.sub)
    except ValueError:
        raise ForbiddenError(FORBIDDEN) from None


class ChatWsHandler:
    def __init__(self, service: ChatService) -> None:
        self._service = service

    async def subscribe(self, request: RoomRequest) -> None:
        event_id = _event_of(request.room)
        await self._service.get_or_create_room(_user_of(request), event_id)

    async def unsubscribe(self, request: RoomRequest) -> None:
        _event_of(request.room)

    async def message(
        self, request: RoomRequest, payload: dict[str, Any]
    ) -> dict[str, Any]:
        event_id = _event_of(request.room)
        text = payload.get("text")
        if not isinstance(text, str):
            raise ValidationError(VALIDATION_ERROR, "The message needs a text.")
        message = await self._service.send_message(
            _user_of(request), event_id, text, origin=request.conn_id
        )
        stored = message.model_dump(mode="json")
        return {"id": stored["id"], "sent_at": stored["sent_at"]}
