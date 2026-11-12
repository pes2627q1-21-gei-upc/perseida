"""Application use cases for event chats."""

import base64
import binascii
import json
import uuid
from datetime import datetime

from app.application.chat.errors import RateLimitedError
from app.application.realtime.errors import PUBSUB_UNAVAILABLE, RATE_LIMITED
from app.application.shared.errors import ExternalServiceError, ForbiddenError
from app.domain.chat.errors import (
    CHAT_INVALID_CURSOR,
    CHAT_INVALID_LIMIT,
    CHAT_MESSAGE_REJECTED,
    PAGE_MAX_LIMIT,
)
from app.domain.chat.models import (
    ChatCursor,
    ChatMessage,
    ChatMessagePage,
    ChatRoomSummary,
    EventChatRoom,
)
from app.domain.chat.ports import (
    ChatRepository,
    EventSubscriptions,
    MessageModerator,
    SendRateLimiter,
)
from app.domain.realtime.models import Frame, FrameType, room_channel
from app.domain.shared.errors import BusinessRuleViolation, ValidationError
from app.domain.shared.ports import PubSub


def _encode(cursor: ChatCursor) -> str:
    raw = json.dumps(
        [cursor.sent_at.isoformat(), str(cursor.id)], separators=(",", ":")
    ).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _decode(value: str) -> ChatCursor:
    try:
        if len(value) > 256:
            raise ValueError
        raw = base64.b64decode(
            value + "=" * (-len(value) % 4), altchars=b"-_", validate=True
        )
        data = json.loads(raw)
        if (
            not isinstance(data, list)
            or len(data) != 2
            or not all(isinstance(x, str) for x in data)
        ):
            raise ValueError
        date = datetime.fromisoformat(data[0])
        if date.utcoffset() is None:
            raise ValueError
        cursor = ChatCursor(sent_at=date, id=uuid.UUID(data[1]))
        if _encode(cursor) != value:
            raise ValueError
        return cursor
    except (
        ValueError,
        TypeError,
        UnicodeError,
        binascii.Error,
        OverflowError,
        RecursionError,
    ) as exc:
        raise ValidationError(CHAT_INVALID_CURSOR) from exc


class ChatService:
    def __init__(
        self,
        repository: ChatRepository,
        subscriptions: EventSubscriptions,
        limiter: SendRateLimiter,
        moderator: MessageModerator,
        pubsub: PubSub,
    ) -> None:
        self._repository = repository
        self._subscriptions = subscriptions
        self._limiter = limiter
        self._moderator = moderator
        self._pubsub = pubsub

    async def get_or_create_room(
        self, user_id: uuid.UUID, event_id: uuid.UUID
    ) -> EventChatRoom:
        # The room lookup comes first: it raises NotFoundError for an event that
        # does not exist, which nobody can be subscribed to (404 before 403).
        room = await self._repository.get_or_create_room(event_id)
        if not await self._subscriptions.is_subscribed(user_id, event_id):
            raise ForbiddenError("FORBIDDEN")
        return room

    async def send_message(
        self, user_id: uuid.UUID, event_id: uuid.UUID, text: str
    ) -> ChatMessage:
        room = await self.get_or_create_room(user_id, event_id)
        message = ChatMessage.create(room_id=room.id, author_id=user_id, text=text)
        if not await self._limiter.hit(user_id):
            raise RateLimitedError(RATE_LIMITED)
        if not (await self._moderator.moderate(message.text)).approved:
            raise BusinessRuleViolation(CHAT_MESSAGE_REJECTED)
        await self._repository.add_message(message)
        await self._publish(message, event_id)
        return message

    async def _publish(self, message: ChatMessage, event_id: uuid.UUID) -> None:
        """Fan the stored message out; on failure it stays stored (history)."""
        room = f"chat:event:{event_id}"
        frame = Frame(
            type=FrameType.MESSAGE, room=room, payload=message.model_dump(mode="json")
        )
        envelope = {"from": None, "frame": frame.model_dump(mode="json")}
        try:
            await self._pubsub.publish(room_channel(room), json.dumps(envelope))
        except ExternalServiceError as exc:
            raise ExternalServiceError(PUBSUB_UNAVAILABLE) from exc

    async def history(
        self,
        user_id: uuid.UUID,
        event_id: uuid.UUID,
        *,
        before: str | None = None,
        limit: int = PAGE_MAX_LIMIT,
    ) -> ChatMessagePage:
        room = await self.get_or_create_room(user_id, event_id)
        if not 1 <= limit <= PAGE_MAX_LIMIT:
            raise ValidationError(CHAT_INVALID_LIMIT)
        cursor = _decode(before) if before is not None else None
        page = await self._repository.page(room.id, cursor, limit)
        return ChatMessagePage(
            messages=page.messages,
            next_cursor=_encode(page.next_cursor) if page.next_cursor else None,
        )

    async def list_rooms(self, user_id: uuid.UUID) -> list[ChatRoomSummary]:
        return await self._repository.list_rooms_of(user_id)
