import uuid

from app.application.shared.errors import ExternalServiceError
from app.domain.chat.models import ChatMessage, ChatMessagePage, ChatRoomSummary, EventChatRoom, ModerationResult
from app.domain.shared.errors import NotFoundError


class ChatFakes:
    def __init__(self) -> None:
        self.user = uuid.uuid7()
        self.event = uuid.uuid7()
        self.room = EventChatRoom.create(event_id=self.event)
        self.calls: list[str] = []
        self.messages: list[ChatMessage] = []
        self.published: list[ChatMessage] = []
        self.subscribed = True
        self.allowed = True
        self.approved = True
        self.fail = False
        self.missing = False

    async def is_subscribed(self, user_id: uuid.UUID, event_id: uuid.UUID) -> bool:
        self.calls.append('subscription')
        return self.subscribed and user_id == self.user and event_id == self.event

    async def get_or_create_room(self, event_id: uuid.UUID) -> EventChatRoom:
        self.calls.append('room')
        if self.missing:
            raise NotFoundError('EVENT_NOT_FOUND')
        return self.room

    async def hit(self, user_id: uuid.UUID) -> bool:
        self.calls.append('rate')
        return self.allowed

    async def moderate(self, text: str) -> ModerationResult:
        self.calls.append('moderate')
        return ModerationResult(approved=self.approved)

    async def store_and_publish(self, message: ChatMessage, event_id: uuid.UUID) -> None:
        if self.fail:
            raise ExternalServiceError('CHAT_DELIVERY_UNAVAILABLE')
        self.calls.extend(['save', 'publish'])
        self.messages.append(message)
        self.published.append(message)

    async def page(self, room_id, before, limit):
        messages = sorted((m for m in self.messages if m.room_id == room_id), key=lambda m: (m.sent_at, m.id), reverse=True)
        if before is not None:
            messages = [m for m in messages if (m.sent_at, m.id) < (before.sent_at, before.id)]
        selected = messages[:limit]
        return ChatMessagePage(messages=selected, next_cursor=selected[-1].id if len(messages) > limit else None)

    async def list_rooms_of(self, user_id: uuid.UUID) -> list[ChatRoomSummary]:
        return [ChatRoomSummary(room=self.room)] if user_id == self.user and self.subscribed else []
