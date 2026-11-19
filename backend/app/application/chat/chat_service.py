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
    CHAT_IDEMPOTENCY_CONFLICT,
    CHAT_INVALID_CURSOR,
    CHAT_INVALID_LIMIT,
    CHAT_MESSAGE_REJECTED,
    CHAT_MESSAGE_TOO_LONG,
    MESSAGE_MAX_LENGTH,
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
from app.domain.shared.errors import (
    BusinessRuleViolation,
    ConflictError,
    ValidationError,
)
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
        *,
        message_max_length: int = MESSAGE_MAX_LENGTH,
    ) -> None:
        if not 1 <= message_max_length <= MESSAGE_MAX_LENGTH:
            raise ValueError("message_max_length must be between 1 and 1000")
        self._message_max_length = message_max_length
        self._repository = repository
        self._subscriptions = subscriptions
        self._limiter = limiter
        self._moderator = moderator
        self._pubsub = pubsub

    async def get_or_create_room(
        self, user_id: uuid.UUID, event_id: uuid.UUID
    ) -> EventChatRoom:
        await self._repository.require_event(event_id)
        if not await self._subscriptions.is_subscribed(user_id, event_id):
            raise ForbiddenError("FORBIDDEN")
        return await self._repository.get_or_create_room(event_id)

    async def open_room(
        self, user_id: uuid.UUID, event_id: uuid.UUID
    ) -> ChatRoomSummary:
        """Return the room of the event, as in the list, with its latest message."""
        room = await self.get_or_create_room(user_id, event_id)
        newest = await self._repository.page(room.id, None, 1)
        return ChatRoomSummary(
            room=room, last_message=newest.messages[0] if newest.messages else None
        )

    async def send_message(
        self,
        user_id: uuid.UUID,
        event_id: uuid.UUID,
        text: str,
        *,
        client_message_id: uuid.UUID,
        origin: str | None = None,
    ) -> ChatMessage:
        """Store, moderate and fan out a message, idempotently.

        ``client_message_id`` is the sender's idempotency key, unique per author.
        A retry with the same key, room and cleaned text republishes the stored
        message and returns it without rate limit, moderation or a new row; the
        same key for another room or text raises ``ConflictError``.

        ``origin`` is the id of the sender's connection (it is put in ``from`` of
        the published envelope so that its own session does not echo it back).
        """
        room = await self.get_or_create_room(user_id, event_id)
        message = ChatMessage.create(
            room_id=room.id,
            author_id=user_id,
            text=text,
            client_message_id=client_message_id,
        )
        if len(message.text) > self._message_max_length:
            raise ValidationError(CHAT_MESSAGE_TOO_LONG)
        existing = await self._repository.find_by_client_id(user_id, client_message_id)
        if existing is not None:
            if existing.room_id != room.id or existing.text != message.text:
                raise ConflictError(CHAT_IDEMPOTENCY_CONFLICT)
            await self._publish(existing, event_id, origin)
            return existing
        if not await self._limiter.hit(user_id):
            raise RateLimitedError(RATE_LIMITED)
        if not (await self._moderator.moderate(message.text)).approved:
            raise BusinessRuleViolation(CHAT_MESSAGE_REJECTED)
        stored = await self._repository.add_message(message)
        await self._publish(stored, event_id, origin)
        return stored

    async def _publish(
        self, message: ChatMessage, event_id: uuid.UUID, origin: str | None
    ) -> None:
        """Fan the stored message out; on failure it stays stored (history)."""
        room = f"chat:event:{event_id}"
        frame = Frame(
            type=FrameType.MESSAGE,
            room=room,
            # The key is the sender's secret: the other members do not get it.
            payload=message.model_dump(mode="json", exclude={"client_message_id"}),
        )
        envelope = {"from": origin, "frame": frame.model_dump(mode="json")}
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
