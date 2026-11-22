"""In-memory ports of the direct chat, for the tests of the service and the domain."""

import uuid
from datetime import datetime

from app.domain.direct_chat.models import (
    DirectConversation,
    DirectCursor,
    DirectMessage,
    DirectMessagePage,
    UserBlock,
)


class InMemoryDirectConversationRepository:
    def __init__(self) -> None:
        self.conversations: dict[uuid.UUID, DirectConversation] = {}

    async def get_or_create(
        self, user_a_id: uuid.UUID, user_b_id: uuid.UUID
    ) -> tuple[DirectConversation, bool]:
        candidate = DirectConversation.create(user_a_id, user_b_id)
        for existing in self.conversations.values():
            if (existing.user_a_id, existing.user_b_id) == (
                candidate.user_a_id,
                candidate.user_b_id,
            ):
                return existing, False
        self.conversations[candidate.id] = candidate
        return candidate, True

    async def get(self, conversation_id: uuid.UUID) -> DirectConversation | None:
        return self.conversations.get(conversation_id)

    async def mark_read(
        self, conversation_id: uuid.UUID, user_id: uuid.UUID, at: datetime
    ) -> DirectConversation:
        updated = self.conversations[conversation_id].mark_read(user_id, at)
        self.conversations[conversation_id] = updated
        return updated

    async def list_of(self, user_id: uuid.UUID) -> list[DirectConversation]:
        return [c for c in self.conversations.values() if c.has_participant(user_id)]


class InMemoryDirectMessageRepository:
    def __init__(self) -> None:
        self.messages: list[DirectMessage] = []

    async def find_by_client_id(
        self, sender_id: uuid.UUID, client_message_id: uuid.UUID
    ) -> DirectMessage | None:
        return next(
            (
                m
                for m in self.messages
                if m.sender_id == sender_id and m.client_message_id == client_message_id
            ),
            None,
        )

    async def add(self, message: DirectMessage) -> DirectMessage:
        existing = await self.find_by_client_id(
            message.sender_id, message.client_message_id
        )
        if existing is not None:
            return existing
        self.messages.append(message)
        return message

    async def page(
        self, conversation_id: uuid.UUID, before: DirectCursor | None, limit: int
    ) -> DirectMessagePage:
        newest_first = sorted(
            (m for m in self.messages if m.conversation_id == conversation_id),
            key=lambda m: (m.sent_at, m.id),
            reverse=True,
        )
        if before is not None:
            newest_first = [
                m
                for m in newest_first
                if (m.sent_at, m.id) < (before.sent_at, before.id)
            ]
        page = newest_first[:limit]
        has_more = len(newest_first) > limit
        return DirectMessagePage(
            messages=page,
            next_cursor=DirectCursor(sent_at=page[-1].sent_at, id=page[-1].id)
            if has_more
            else None,
        )

    async def count_unread(
        self, conversation_id: uuid.UUID, user_id: uuid.UUID, since: datetime | None
    ) -> int:
        return sum(
            1
            for m in self.messages
            if m.conversation_id == conversation_id
            and m.sender_id != user_id
            and (since is None or m.sent_at > since)
        )


class InMemoryUserBlockRepository:
    def __init__(self) -> None:
        self.blocks: set[tuple[uuid.UUID, uuid.UUID]] = set()

    async def block(self, user_block: UserBlock) -> None:
        self.blocks.add((user_block.blocker_id, user_block.blocked_id))

    async def unblock(self, blocker_id: uuid.UUID, blocked_id: uuid.UUID) -> None:
        self.blocks.discard((blocker_id, blocked_id))

    async def is_blocked(self, blocker_id: uuid.UUID, blocked_id: uuid.UUID) -> bool:
        return (blocker_id, blocked_id) in self.blocks


class RecordingPushNotifier:
    def __init__(self) -> None:
        self.sent: list[tuple[uuid.UUID, DirectMessage]] = []

    async def notify(self, recipient_id: uuid.UUID, message: DirectMessage) -> None:
        self.sent.append((recipient_id, message))
