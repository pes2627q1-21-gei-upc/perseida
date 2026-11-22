"""In-memory ports of the direct chat, for the tests of the service and the domain."""

import uuid
from datetime import datetime

from app.application.shared.errors import ExternalServiceError
from app.domain.direct_chat.models import (
    DirectConversation,
    DirectCursor,
    DirectMessage,
    DirectMessagePage,
    UserBlock,
)
from app.domain.shared.moderation import ModerationResult
from tests.fakes.chat import ChatFakes


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


class FakeChatUserDirectory:
    """Existing users; a deleted or unknown user is simply not in the set."""

    def __init__(self, log: list[str] | None = None) -> None:
        self.existing: set[uuid.UUID] = set()
        self.log = log if log is not None else []

    async def exists(self, user_id: uuid.UUID) -> bool:
        self.log.append("directory")
        return user_id in self.existing


class FakeDirectMessageBroadcaster:
    """Records every delivery; ``recipients`` is what deliver reports as connected."""

    def __init__(self, log: list[str] | None = None) -> None:
        self.log = log if log is not None else []
        self.fail = False
        self.recipients = 1
        self.calls: list[tuple[DirectMessage, uuid.UUID, str | None]] = []

    async def deliver(
        self, message: DirectMessage, *, recipient_id: uuid.UUID, origin: str | None
    ) -> int:
        self.log.append("deliver")
        if self.fail:
            raise ExternalServiceError("PUBSUB_UNAVAILABLE")
        self.calls.append((message, recipient_id, origin))
        return self.recipients


class _LoggedMessages(InMemoryDirectMessageRepository):
    def __init__(self, log: list[str]) -> None:
        super().__init__()
        self.log = log

    async def find_by_client_id(
        self, sender_id: uuid.UUID, client_message_id: uuid.UUID
    ) -> DirectMessage | None:
        self.log.append("find")
        return await super().find_by_client_id(sender_id, client_message_id)

    async def add(self, message: DirectMessage) -> DirectMessage:
        self.log.append("save")
        # The base ``add`` would go through the overridden ``find_by_client_id``
        # and log a second "find": call the base lookup explicitly.
        existing = await InMemoryDirectMessageRepository.find_by_client_id(
            self, message.sender_id, message.client_message_id
        )
        if existing is not None:
            return existing
        self.messages.append(message)
        return message


class _LoggedBlocks(InMemoryUserBlockRepository):
    def __init__(self, log: list[str]) -> None:
        super().__init__()
        self.log = log

    async def is_blocked(self, blocker_id: uuid.UUID, blocked_id: uuid.UUID) -> bool:
        self.log.append("block")
        return await super().is_blocked(blocker_id, blocked_id)


class _Chat(ChatFakes):
    """Limiter and moderator of the event chat, with a way to make the limiter fail."""

    def __init__(self) -> None:
        super().__init__()
        self.fail_rate = False

    async def hit(self, user_id: uuid.UUID) -> bool:
        if self.fail_rate:
            self.calls.append("rate")
            raise ExternalServiceError("REDIS_UNAVAILABLE")
        return await super().hit(user_id)

    async def moderate(self, text: str) -> ModerationResult:
        return await super().moderate(text)


class DirectChatHarness:
    """Every port of the direct chat service, all writing to one ordered ``log``.

    The limiter and the moderator are those of ``ChatFakes`` (flags ``allowed`` and
    ``approved``); they log ``"rate"`` and ``"moderate"`` into the same list.
    """

    def __init__(self) -> None:
        self.log: list[str] = []
        self.conversations = InMemoryDirectConversationRepository()
        self.messages = _LoggedMessages(self.log)
        self.blocks = _LoggedBlocks(self.log)
        self.users = FakeChatUserDirectory(self.log)
        self.broadcaster = FakeDirectMessageBroadcaster(self.log)
        self.push = RecordingPushNotifier()
        self.chat = _Chat()
        self.chat.calls = self.log
