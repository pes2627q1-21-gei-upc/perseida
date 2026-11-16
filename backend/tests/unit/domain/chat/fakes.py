"""In-memory ports of the chat, for the tests of the service (#442) and the domain."""

import uuid

from app.domain.chat.models import (
    ChatMessage,
    ChatMessagePage,
    ChatRoomSummary,
    EventChatRoom,
    ModerationResult,
)


class InMemoryChatRepository:
    def __init__(self) -> None:
        self.rooms: dict[uuid.UUID, EventChatRoom] = {}
        self.messages: list[ChatMessage] = []

    async def get_or_create_room(self, event_id: uuid.UUID) -> EventChatRoom:
        if event_id not in self.rooms:
            self.rooms[event_id] = EventChatRoom.create(event_id=event_id)
        return self.rooms[event_id]

    async def add_message(self, message: ChatMessage) -> None:
        self.messages.append(message)

    async def page(
        self, room_id: uuid.UUID, before: uuid.UUID | None, limit: int
    ) -> ChatMessagePage:
        newest_first = sorted(
            (m for m in self.messages if m.room_id == room_id),
            key=lambda m: m.id,
            reverse=True,
        )
        if before is not None:
            newest_first = [m for m in newest_first if m.id < before]
        page = newest_first[:limit]
        has_more = len(newest_first) > limit
        return ChatMessagePage(
            messages=page, next_cursor=page[-1].id if has_more else None
        )

    async def list_rooms_of(self, user_id: uuid.UUID) -> list[ChatRoomSummary]:
        # Subscriptions live in another port: this fake lists every room.
        return [
            ChatRoomSummary(
                room=room,
                last_message=max(
                    (m for m in self.messages if m.room_id == room.id),
                    key=lambda m: m.id,
                    default=None,
                ),
            )
            for room in self.rooms.values()
        ]


class ApprovingModerator:
    async def moderate(self, text: str) -> ModerationResult:
        return ModerationResult(approved=True)


class CountingRateLimiter:
    def __init__(self, limit: int) -> None:
        self.limit = limit
        self.hits: dict[uuid.UUID, int] = {}

    async def hit(self, user_id: uuid.UUID) -> bool:
        self.hits[user_id] = self.hits.get(user_id, 0) + 1
        return self.hits[user_id] <= self.limit


class StaticSubscriptions:
    def __init__(self, *pairs: tuple[uuid.UUID, uuid.UUID]) -> None:
        self.pairs = set(pairs)

    async def is_subscribed(self, user_id: uuid.UUID, event_id: uuid.UUID) -> bool:
        return (user_id, event_id) in self.pairs
