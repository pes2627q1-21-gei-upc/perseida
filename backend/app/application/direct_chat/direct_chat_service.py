"""Application use cases for the direct chat between two users (US #65)."""

import uuid

from app.application.shared.error_codes import PUBSUB_UNAVAILABLE, RATE_LIMITED
from app.application.shared.errors import (
    ExternalServiceError,
    ForbiddenError,
    RateLimitedError,
)
from app.domain.direct_chat.errors import (
    CANNOT_MESSAGE_SELF,
    CONVERSATION_NOT_FOUND,
    USER_BLOCKED,
    USER_NOT_FOUND,
)
from app.domain.direct_chat.models import DirectConversation, DirectMessage
from app.domain.direct_chat.ports import (
    ChatUserDirectory,
    DirectConversationRepository,
    DirectMessageBroadcaster,
    DirectMessageRepository,
    PushNotifier,
    UserBlockRepository,
)
from app.domain.shared.errors import BusinessRuleViolation, NotFoundError
from app.domain.shared.moderation import CHAT_MESSAGE_REJECTED
from app.domain.shared.ports import MessageModerator, SendRateLimiter


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
    ) -> None:
        self._conversations = conversations
        self._messages = messages
        self._blocks = blocks
        self._users = users
        self._limiter = limiter
        self._moderator = moderator
        self._broadcaster = broadcaster
        self._push = push

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
        moderation, no new row) and delivers it again. If the recipient has no
        live connection, a push is sent instead.

        ``origin`` is the id of the sender's connection (not echoed back to it).

        Raises:
            NotFoundError: CONVERSATION_NOT_FOUND if it does not exist or
                ``user_id`` is not a participant.
            ForbiddenError: USER_BLOCKED if either user blocks the other.
            ValidationError: VALIDATION_ERROR for an empty or too long text.
            RateLimitedError: RATE_LIMITED if the sender sent too much.
            BusinessRuleViolation: CHAT_MESSAGE_REJECTED if moderation refuses it.
            ExternalServiceError: if the limiter or a store is unavailable
                (nothing is stored), or PUBSUB_UNAVAILABLE if the delivery failed
                (the message is already stored; a retry delivers it).
        """
        conversation = await self._conversations.get(conversation_id)
        if conversation is None or not conversation.has_participant(user_id):
            raise NotFoundError(
                CONVERSATION_NOT_FOUND, "The conversation does not exist"
            )
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
            await self._push.notify(recipient_id, message)
