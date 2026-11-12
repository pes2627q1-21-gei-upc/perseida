import uuid
from collections.abc import AsyncIterator
from contextlib import AbstractAsyncContextManager

from app.application.shared.errors import ExternalServiceError
from app.domain.chat.models import (
    ChatCursor,
    ChatMessage,
    ChatRepositoryPage,
    ChatRoomSummary,
    EventChatRoom,
    ModerationResult,
)
from app.domain.shared.errors import NotFoundError


class ChatFakes:
    def __init__(self) -> None:
        self.user = uuid.uuid7()
        self.event = uuid.uuid7()
        self.room = EventChatRoom.create(event_id=self.event)
        self.calls: list[str] = []
        self.messages: list[ChatMessage] = []
        self.published: list[str] = []
        self.subscribed = True
        self.allowed = True
        self.approved = True
        self.fail_save = False
        self.fail_publish = False
        self.missing = False
        self.channels: list[str] = []

    async def is_subscribed(self, user_id: uuid.UUID, event_id: uuid.UUID) -> bool:
        self.calls.append("subscription")
        return self.subscribed and user_id == self.user and event_id == self.event

    async def get_or_create_room(self, event_id: uuid.UUID) -> EventChatRoom:
        self.calls.append("room")
        if self.missing:
            raise NotFoundError("EVENT_NOT_FOUND")
        return self.room

    async def hit(self, user_id: uuid.UUID) -> bool:
        self.calls.append("rate")
        return self.allowed

    async def moderate(self, text: str) -> ModerationResult:
        self.calls.append("moderate")
        return ModerationResult(approved=self.approved)

    def subscribe(
        self, channel: str
    ) -> AbstractAsyncContextManager[AsyncIterator[str]]:
        raise NotImplementedError

    async def add_message(self, message: ChatMessage) -> None:
        self.calls.append("save")
        if self.fail_save:
            raise ExternalServiceError("DATABASE_UNAVAILABLE")
        self.messages.append(message)

    async def publish(self, channel: str, message: str) -> None:
        self.calls.append("publish")
        if self.fail_publish:
            raise ExternalServiceError("REDIS_DOWN")
        self.channels.append(channel)
        self.published.append(message)

    async def page(
        self, room_id: uuid.UUID, before: ChatCursor | None, limit: int
    ) -> ChatRepositoryPage:
        messages = sorted(
            (m for m in self.messages if m.room_id == room_id),
            key=lambda m: (m.sent_at, m.id),
            reverse=True,
        )
        if before is not None:
            messages = [
                m for m in messages if (m.sent_at, m.id) < (before.sent_at, before.id)
            ]
        selected = messages[:limit]
        return ChatRepositoryPage(
            messages=selected,
            next_cursor=ChatCursor(sent_at=selected[-1].sent_at, id=selected[-1].id)
            if len(messages) > limit
            else None,
        )

    async def list_rooms_of(self, user_id: uuid.UUID) -> list[ChatRoomSummary]:
        return (
            [ChatRoomSummary(room=self.room)]
            if user_id == self.user and self.subscribed
            else []
        )
