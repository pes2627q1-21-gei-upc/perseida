"""Chat rooms of the WebSocket (``chat:event:<event_id>``), TG-459.

Adapts ``ChatService`` to the ``RoomHandler`` port of ``RealtimeSession``: the
room names the event, the user is resolved from the ``sub`` of the
session and the service
owns the rules (subscription to the event, rate limit, moderation, storage and
fan-out). Its errors travel unchanged to the session, which turns them into
frames ``error``.
"""

import uuid
from collections.abc import Callable
from typing import Any

from app.application.chat.chat_service import ChatService
from app.application.realtime.errors import VALIDATION_ERROR
from app.application.realtime.room_handler import RoomRequest
from app.application.users.user_service import UserService
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


def _client_message_id_of(payload: dict[str, Any]) -> uuid.UUID:
    """The idempotency key of a message; only the canonical form of a UUID.

    Raises:
        ValidationError: VALIDATION_ERROR if it is missing or not canonical.
    """
    value = payload.get("client_message_id")
    error = ValidationError(
        VALIDATION_ERROR, "The message needs a canonical client_message_id."
    )
    if not isinstance(value, str):
        raise error
    try:
        key = uuid.UUID(value)
    except ValueError:
        raise error from None
    if str(key) != value:
        raise error
    return key


class ChatWsHandler:
    def __init__(
        self, service: Callable[[], ChatService], users: Callable[[], UserService]
    ) -> None:
        # Providers, not instances: the services are built over the resources of
        # the app when the first chat frame arrives, so a connection that never
        # uses the chat (or an app without database) does not need them.
        self._service = service
        self._users = users

    async def _user_of(self, request: RoomRequest) -> uuid.UUID:
        """The user of the session: ``sub`` is the Google subject, not the user id.

        Raises ``UnauthorizedError`` (INVALID_SESSION) or ``ForbiddenError``
        (ACCOUNT_SUSPENDED, ACCOUNT_DELETED), the same as the REST endpoints.
        """
        return (await self._users().get_profile(request.sub)).id

    async def subscribe(self, request: RoomRequest) -> None:
        event_id = _event_of(request.room)
        user_id = await self._user_of(request)
        await self._service().get_or_create_room(user_id, event_id)

    async def unsubscribe(self, request: RoomRequest) -> None:
        _event_of(request.room)

    async def message(
        self, request: RoomRequest, payload: dict[str, Any]
    ) -> dict[str, Any]:
        event_id = _event_of(request.room)
        text = payload.get("text")
        if not isinstance(text, str):
            raise ValidationError(VALIDATION_ERROR, "The message needs a text.")
        client_message_id = _client_message_id_of(payload)
        user_id = await self._user_of(request)
        message = await self._service().send_message(
            user_id,
            event_id,
            text,
            client_message_id=client_message_id,
            origin=request.conn_id,
        )
        stored = message.model_dump(mode="json")
        return {"id": stored["id"], "sent_at": stored["sent_at"]}
