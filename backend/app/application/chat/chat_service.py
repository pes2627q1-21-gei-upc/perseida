"""Application use cases for event chats."""

import base64
import binascii
import json
import uuid
from datetime import datetime

from app.application.chat.errors import RateLimitedError
from app.application.shared.errors import ForbiddenError
from app.domain.chat.errors import CHAT_MESSAGE_REJECTED, PAGE_MAX_LIMIT
from app.domain.chat.models import (
    ChatCursor,
    ChatMessage,
    ChatMessagePage,
    ChatRoomSummary,
    EventChatRoom,
)
from app.domain.chat.ports import (
    ChatDelivery,
    ChatRepository,
    EventSubscriptions,
    MessageModerator,
    SendRateLimiter,
)
from app.domain.shared.errors import BusinessRuleViolation, ValidationError


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
        raise ValidationError("CHAT_INVALID_CURSOR") from exc


class ChatService:
    def __init__(
        self,
        repository: ChatRepository,
        subscriptions: EventSubscriptions,
        limiter: SendRateLimiter,
        moderator: MessageModerator,
        delivery: ChatDelivery,
    ) -> None:
        self._repository = repository
        self._subscriptions = subscriptions
        self._limiter = limiter
        self._moderator = moderator
        self._delivery = delivery

    async def get_or_create_room(
        self, user_id: uuid.UUID, event_id: uuid.UUID
    ) -> EventChatRoom:
        if not await self._subscriptions.is_subscribed(user_id, event_id):
            raise ForbiddenError("FORBIDDEN")
        return await self._repository.get_or_create_room(event_id)

    async def send_message(
        self, user_id: uuid.UUID, event_id: uuid.UUID, text: str
    ) -> ChatMessage:
        room = await self.get_or_create_room(user_id, event_id)
        message = ChatMessage.create(room_id=room.id, author_id=user_id, text=text)
        if not await self._limiter.hit(user_id):
            raise RateLimitedError("RATE_LIMITED")
        if not (await self._moderator.moderate(message.text)).approved:
            raise BusinessRuleViolation(CHAT_MESSAGE_REJECTED)
        await self._delivery.store_and_publish(message, event_id)
        return message

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
            raise ValidationError("CHAT_INVALID_LIMIT")
        cursor = _decode(before) if before is not None else None
        page = await self._repository.page(room.id, cursor, limit)
        return ChatMessagePage(
            messages=page.messages,
            next_cursor=_encode(page.next_cursor) if page.next_cursor else None,
        )

    async def list_rooms(self, user_id: uuid.UUID) -> list[ChatRoomSummary]:
        return await self._repository.list_rooms_of(user_id)
