"""Application use cases for the direct chat between two users (US #65)."""

import logging
import uuid
from collections.abc import Callable
from datetime import UTC, datetime

from app.application.direct_chat.models import (
    ConversationOverview,
    DirectHistoryPage,
)
from app.application.shared.cursor import decode_cursor, encode_cursor
from app.application.shared.error_codes import PUBSUB_UNAVAILABLE, RATE_LIMITED
from app.application.shared.errors import (
    ExternalServiceError,
    ForbiddenError,
    RateLimitedError,
)
from app.domain.direct_chat.errors import (
    CANNOT_MESSAGE_SELF,
    CONVERSATION_NOT_FOUND,
    DIRECT_IDEMPOTENCY_CONFLICT,
    USER_BLOCKED,
    USER_NOT_FOUND,
    VALIDATION_ERROR,
)
from app.domain.direct_chat.models import (
    ConversationSummary,
    DirectConversation,
    DirectCursor,
    DirectMessage,
    UserBlock,
)
from app.domain.direct_chat.ports import (
    ChatUserDirectory,
    DirectConversationRepository,
    DirectMessageBroadcaster,
    DirectMessageRepository,
    PushNotifier,
    UserBlockRepository,
)
from app.domain.shared.errors import (
    BusinessRuleViolation,
    ConflictError,
    NotFoundError,
    ValidationError,
)
from app.domain.shared.moderation import CHAT_MESSAGE_REJECTED
from app.domain.shared.ports import MessageModerator, SendRateLimiter

logger = logging.getLogger(__name__)

PREVIEW_MAX_LENGTH = 100
HISTORY_DEFAULT_LIMIT = 50
HISTORY_MAX_LIMIT = 50


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _preview(text: str) -> str:
    if len(text) <= PREVIEW_MAX_LENGTH:
        return text
    return text[: PREVIEW_MAX_LENGTH - 1] + "…"


class DirectChatService:
    def __init__(
        self,
        conversations: DirectConversationRepository,
        messages: DirectMessageRepository,
        blocks: UserBlockRepository,
        users: ChatUserDirectory,
        limiter: SendRateLimiter,
        moderator: MessageModerator,
        broadcaster: DirectMessageBroadcaster,
        push: PushNotifier,
        now: Callable[[], datetime] = _utc_now,
    ) -> None:
        self._conversations = conversations
        self._messages = messages
        self._blocks = blocks
        self._users = users
        self._limiter = limiter
        self._moderator = moderator
        self._broadcaster = broadcaster
        self._push = push
        self._now = now

    async def open_conversation(
        self, user_id: uuid.UUID, other_user_id: uuid.UUID
    ) -> tuple[DirectConversation, bool]:
        """Return the conversation of the two users and whether it was just created.

        Raises:
            BusinessRuleViolation: CANNOT_MESSAGE_SELF if both are the same user.
            NotFoundError: USER_NOT_FOUND if the other user does not exist.
        """
        if user_id == other_user_id:
            raise BusinessRuleViolation(
                CANNOT_MESSAGE_SELF, "A user cannot talk to themselves"
            )
        if not await self._users.exists(other_user_id):
            raise NotFoundError(USER_NOT_FOUND, "The user does not exist")
        return await self._conversations.get_or_create(user_id, other_user_id)

    async def send_message(
        self,
        user_id: uuid.UUID,
        conversation_id: uuid.UUID,
        text: str,
        *,
        client_message_id: uuid.UUID,
        origin: str | None = None,
    ) -> DirectMessage:
        """Store, moderate and deliver a message, idempotently.

        Order: participant, blocks (both ways), text validation, idempotency, rate
        limit, moderation, store, deliver. A retry with the same
        ``client_message_id`` returns the stored message (no rate limit, no
        moderation, no new row) and delivers it again; the same key for another
        conversation or text is a conflict. If the recipient has no live
        connection, a best-effort push is sent instead (a failing push is logged).

        ``origin`` is the id of the sender's connection (not echoed back to it).

        Raises:
            NotFoundError: CONVERSATION_NOT_FOUND if it does not exist or
                ``user_id`` is not a participant.
            ForbiddenError: USER_BLOCKED if either user blocks the other.
            ValidationError: VALIDATION_ERROR for an empty or too long text.
            ConflictError: DIRECT_IDEMPOTENCY_CONFLICT if the key was used with
                another conversation or text.
            RateLimitedError: RATE_LIMITED if the sender sent too much.
            BusinessRuleViolation: CHAT_MESSAGE_REJECTED if moderation refuses it.
            ExternalServiceError: if the limiter or a store is unavailable
                (nothing is stored), or PUBSUB_UNAVAILABLE if the delivery failed
                (the message is already stored; a retry delivers it).
        """
        conversation = await self._participant_conversation(user_id, conversation_id)
        recipient_id = conversation.other_participant(user_id)
        # Either direction blocks the conversation; the history is kept.
        if await self._blocks.is_blocked(
            recipient_id, user_id
        ) or await self._blocks.is_blocked(user_id, recipient_id):
            raise ForbiddenError(USER_BLOCKED, "The conversation is blocked")
        message = DirectMessage.create(
            conversation_id=conversation.id,
            sender_id=user_id,
            text=text,
            client_message_id=client_message_id,
        )
        stored = await self._messages.find_by_client_id(user_id, client_message_id)
        if stored is None:
            stored = await self._store(message)
        elif (
            stored.conversation_id != message.conversation_id
            or stored.text != message.text
        ):
            raise ConflictError(DIRECT_IDEMPOTENCY_CONFLICT)
        await self._deliver(stored, recipient_id, origin)
        return stored

    async def _store(self, message: DirectMessage) -> DirectMessage:
        # Fail closed: a limiter that is down propagates before anything is stored.
        if not await self._limiter.hit(message.sender_id):
            raise RateLimitedError(RATE_LIMITED)
        if not (await self._moderator.moderate(message.text)).approved:
            raise BusinessRuleViolation(CHAT_MESSAGE_REJECTED)
        return await self._messages.add(message)

    async def _deliver(
        self, message: DirectMessage, recipient_id: uuid.UUID, origin: str | None
    ) -> None:
        try:
            receivers = await self._broadcaster.deliver(
                message, recipient_id=recipient_id, origin=origin
            )
        except ExternalServiceError as exc:
            raise ExternalServiceError(PUBSUB_UNAVAILABLE) from exc
        if receivers == 0:
            await self._notify(recipient_id, message)

    async def _notify(self, recipient_id: uuid.UUID, message: DirectMessage) -> None:
        """Best effort: the message is already stored and delivered."""
        try:
            await self._push.notify(recipient_id, message)
        except Exception:
            logger.warning("Could not push the direct message", exc_info=True)

    async def list_conversations(
        self, user_id: uuid.UUID
    ) -> list[ConversationOverview]:
        """Return the conversations of ``user_id``, newest activity first.

        Two port calls whatever the number of conversations: the summaries and
        which of the other participants the user blocks.

        Raises:
            ExternalServiceError: if a store is unavailable.
        """
        summaries = await self._conversations.summaries_of(user_id)
        others = {s.conversation.other_participant(user_id) for s in summaries}
        blocked = await self._blocks.blocked_among(user_id, others)
        return [self._overview(s, user_id, blocked) for s in summaries]

    @staticmethod
    def _overview(
        summary: ConversationSummary, user_id: uuid.UUID, blocked: set[uuid.UUID]
    ) -> ConversationOverview:
        conversation = summary.conversation
        last = summary.last_message
        other_id = conversation.other_participant(user_id)
        return ConversationOverview(
            conversation_id=conversation.id,
            other_user_id=other_id,
            last_message_preview=_preview(last.text) if last else None,
            last_message_at=last.sent_at if last else None,
            last_message_sender_id=last.sender_id if last else None,
            unread_count=summary.unread_count,
            blocked_by_me=other_id in blocked,
            created_at=conversation.created_at,
        )

    async def get_history(
        self,
        user_id: uuid.UUID,
        conversation_id: uuid.UUID,
        *,
        before: str | None = None,
        limit: int = HISTORY_DEFAULT_LIMIT,
    ) -> DirectHistoryPage:
        """Return a page of the history, newest first. Blocks do not hide it.

        Raises:
            NotFoundError: CONVERSATION_NOT_FOUND if it does not exist or
                ``user_id`` is not a participant.
            ValidationError: VALIDATION_ERROR if ``limit`` is not in 1..50 or
                ``before`` is not a valid cursor.
            ExternalServiceError: if the database is unavailable.
        """
        await self._participant_conversation(user_id, conversation_id)
        if not 1 <= limit <= HISTORY_MAX_LIMIT:
            raise ValidationError(
                VALIDATION_ERROR,
                f"The limit must be between 1 and {HISTORY_MAX_LIMIT}",
            )
        cursor = None
        if before is not None:
            sent_at, id_ = decode_cursor(before, VALIDATION_ERROR)
            cursor = DirectCursor(sent_at=sent_at, id=id_)
        page = await self._messages.page(conversation_id, cursor, limit)
        next_cursor = page.next_cursor
        return DirectHistoryPage(
            items=page.messages,
            next_cursor=(
                encode_cursor(next_cursor.sent_at, next_cursor.id)
                if next_cursor is not None
                else None
            ),
        )

    async def mark_read(self, user_id: uuid.UUID, conversation_id: uuid.UUID) -> None:
        """Mark the conversation as read by ``user_id`` up to now.

        Raises:
            NotFoundError: CONVERSATION_NOT_FOUND if it does not exist or
                ``user_id`` is not a participant.
            ExternalServiceError: if the database is unavailable.
        """
        await self._participant_conversation(user_id, conversation_id)
        await self._conversations.mark_read(conversation_id, user_id, self._now())

    async def block_user(self, user_id: uuid.UUID, other_user_id: uuid.UUID) -> None:
        """Block ``other_user_id``: idempotent; the history is kept.

        Raises:
            BusinessRuleViolation: CANNOT_MESSAGE_SELF if both are the same user.
            NotFoundError: USER_NOT_FOUND if the other user does not exist.
            ExternalServiceError: if a store is unavailable.
        """
        user_block = UserBlock.create(user_id, other_user_id)
        if not await self._users.exists(other_user_id):
            raise NotFoundError(USER_NOT_FOUND, "The user does not exist")
        await self._blocks.block(user_block)

    async def unblock_user(self, user_id: uuid.UUID, other_user_id: uuid.UUID) -> None:
        """Remove the block, if any. Idempotent; does not check the user exists.

        Raises:
            ExternalServiceError: if the database is unavailable.
        """
        await self._blocks.unblock(user_id, other_user_id)

    async def _participant_conversation(
        self, user_id: uuid.UUID, conversation_id: uuid.UUID
    ) -> DirectConversation:
        conversation = await self._conversations.get(conversation_id)
        if conversation is None or not conversation.has_participant(user_id):
            raise NotFoundError(
                CONVERSATION_NOT_FOUND, "The conversation does not exist"
            )
        return conversation
