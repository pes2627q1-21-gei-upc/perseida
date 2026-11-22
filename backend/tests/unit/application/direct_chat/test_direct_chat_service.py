"""TG-65 (task #401): open a direct conversation and send a message."""

import uuid

import pytest

from app.application.direct_chat.direct_chat_service import DirectChatService
from app.application.shared.errors import (
    ExternalServiceError,
    ForbiddenError,
    RateLimitedError,
)
from app.domain.direct_chat.errors import (
    CANNOT_MESSAGE_SELF,
    CONVERSATION_NOT_FOUND,
    MESSAGE_MAX_LENGTH,
    USER_BLOCKED,
    USER_NOT_FOUND,
    VALIDATION_ERROR,
)
from app.domain.direct_chat.models import DirectConversation, UserBlock
from app.domain.shared.errors import (
    BusinessRuleViolation,
    ConflictError,
    NotFoundError,
    ValidationError,
)
from tests.fakes.direct_chat import DirectChatHarness

CHAT_MESSAGE_REJECTED = "CHAT_MESSAGE_REJECTED"
PUBSUB_UNAVAILABLE = "PUBSUB_UNAVAILABLE"
RATE_LIMITED = "RATE_LIMITED"

ALICE = uuid.uuid7()
BOB = uuid.uuid7()
EVE = uuid.uuid7()


@pytest.fixture
def env() -> DirectChatHarness:
    harness = DirectChatHarness()
    harness.users.existing.update({ALICE, BOB, EVE})
    return harness


@pytest.fixture
def service(env: DirectChatHarness) -> DirectChatService:
    return DirectChatService(
        env.conversations,
        env.messages,
        env.blocks,
        env.users,
        env.chat,
        env.chat,
        env.broadcaster,
        env.push,
    )


async def _conversation(env: DirectChatHarness) -> DirectConversation:
    conversation, _ = await env.conversations.get_or_create(ALICE, BOB)
    return conversation


def _no_side_effects(env: DirectChatHarness) -> None:
    assert env.messages.messages == []
    assert env.broadcaster.calls == []
    assert env.push.sent == []


# --- open_conversation (criteris 1, 3, 4) ------------------------------------


async def test_tg65_open_creates_then_recovers_the_same_conversation(
    service: DirectChatService,
) -> None:
    first, created = await service.open_conversation(ALICE, BOB)
    again, created_again = await service.open_conversation(ALICE, BOB)

    assert created is True
    assert created_again is False
    assert again.id == first.id


async def test_tg65_open_is_symmetric(service: DirectChatService) -> None:
    from_alice, _ = await service.open_conversation(ALICE, BOB)
    from_bob, created = await service.open_conversation(BOB, ALICE)

    assert created is False
    assert from_bob.id == from_alice.id


async def test_tg65_open_with_an_unknown_user_is_not_found(
    service: DirectChatService,
) -> None:
    with pytest.raises(NotFoundError) as exc_info:
        await service.open_conversation(ALICE, uuid.uuid7())

    assert exc_info.value.code == USER_NOT_FOUND


async def test_tg65_open_with_a_deleted_user_is_not_found(
    service: DirectChatService, env: DirectChatHarness
) -> None:
    env.users.existing.discard(BOB)  # deleted_at set: the directory hides them

    with pytest.raises(NotFoundError) as exc_info:
        await service.open_conversation(ALICE, BOB)

    assert exc_info.value.code == USER_NOT_FOUND
    assert env.conversations.conversations == {}


async def test_tg65_open_with_oneself_fails_without_asking_the_directory(
    service: DirectChatService, env: DirectChatHarness
) -> None:
    with pytest.raises(BusinessRuleViolation) as exc_info:
        await service.open_conversation(ALICE, ALICE)

    assert exc_info.value.code == CANNOT_MESSAGE_SELF
    assert "directory" not in env.log
    assert env.conversations.conversations == {}


# --- send_message: happy path -------------------------------------------------


async def test_tg65_send_stores_and_delivers_to_the_recipient(
    service: DirectChatService, env: DirectChatHarness
) -> None:
    conversation = await _conversation(env)

    message = await service.send_message(
        ALICE, conversation.id, " hola ", client_message_id=uuid.uuid4(), origin="o1"
    )

    assert message.text == "hola"
    assert message.sender_id == ALICE
    assert message.conversation_id == conversation.id
    assert env.messages.messages == [message]
    assert env.broadcaster.calls == [(message, BOB, "o1")]
    assert env.push.sent == []


async def test_tg65_send_without_origin_delivers_with_none(
    service: DirectChatService, env: DirectChatHarness
) -> None:
    conversation = await _conversation(env)

    message = await service.send_message(
        BOB, conversation.id, "hi", client_message_id=uuid.uuid4()
    )

    assert env.broadcaster.calls == [(message, ALICE, None)]


async def test_tg65_send_checks_in_the_documented_order(
    service: DirectChatService, env: DirectChatHarness
) -> None:
    conversation = await _conversation(env)

    await service.send_message(
        ALICE, conversation.id, "hola", client_message_id=uuid.uuid4()
    )

    # blocks (both ways) -> idempotency -> rate limit -> moderator -> store -> deliver
    assert env.log == ["block", "block", "find", "rate", "moderate", "save", "deliver"]


# --- moderation (criteri 8) ---------------------------------------------------


async def test_tg65_rejected_message_is_not_stored_delivered_or_pushed(
    service: DirectChatService, env: DirectChatHarness
) -> None:
    conversation = await _conversation(env)
    env.chat.approved = False

    with pytest.raises(BusinessRuleViolation) as exc_info:
        await service.send_message(
            ALICE, conversation.id, "insult", client_message_id=uuid.uuid4()
        )

    assert exc_info.value.code == CHAT_MESSAGE_REJECTED
    assert "moderate" in env.log
    assert "save" not in env.log
    _no_side_effects(env)


# --- validation (criteri 7) ---------------------------------------------------


@pytest.mark.parametrize("text", ["", "   ", "\n\t "])
async def test_tg65_empty_text_is_a_validation_error(
    service: DirectChatService, env: DirectChatHarness, text: str
) -> None:
    conversation = await _conversation(env)

    with pytest.raises(ValidationError) as exc_info:
        await service.send_message(
            ALICE, conversation.id, text, client_message_id=uuid.uuid4()
        )

    assert exc_info.value.code == VALIDATION_ERROR
    assert "rate" not in env.log
    assert "moderate" not in env.log
    _no_side_effects(env)


async def test_tg65_text_over_the_limit_is_a_validation_error(
    service: DirectChatService, env: DirectChatHarness
) -> None:
    conversation = await _conversation(env)

    with pytest.raises(ValidationError) as exc_info:
        await service.send_message(
            ALICE,
            conversation.id,
            "a" * (MESSAGE_MAX_LENGTH + 1),
            client_message_id=uuid.uuid4(),
        )

    assert exc_info.value.code == VALIDATION_ERROR
    assert "rate" not in env.log
    _no_side_effects(env)


async def test_tg65_text_of_exactly_the_limit_is_accepted(
    service: DirectChatService, env: DirectChatHarness
) -> None:
    conversation = await _conversation(env)

    message = await service.send_message(
        ALICE,
        conversation.id,
        "a" * MESSAGE_MAX_LENGTH,
        client_message_id=uuid.uuid4(),
    )

    assert len(message.text) == MESSAGE_MAX_LENGTH
    assert env.messages.messages == [message]


# --- rate limit (criteri 9) ---------------------------------------------------


async def test_tg65_rate_limit_exceeded_is_rejected_and_not_stored(
    service: DirectChatService, env: DirectChatHarness
) -> None:
    conversation = await _conversation(env)
    env.chat.allowed = False

    with pytest.raises(RateLimitedError) as exc_info:
        await service.send_message(
            ALICE, conversation.id, "hola", client_message_id=uuid.uuid4()
        )

    assert exc_info.value.code == RATE_LIMITED
    assert "moderate" not in env.log
    _no_side_effects(env)


async def test_tg65_limiter_down_fails_closed_before_storing(
    service: DirectChatService, env: DirectChatHarness
) -> None:
    conversation = await _conversation(env)
    env.chat.fail_rate = True

    with pytest.raises(ExternalServiceError):
        await service.send_message(
            ALICE, conversation.id, "hola", client_message_id=uuid.uuid4()
        )

    assert "save" not in env.log
    assert "deliver" not in env.log
    _no_side_effects(env)


# --- blocks and access (criteris 4, 12) ---------------------------------------


async def test_tg65_blocked_sender_cannot_send(
    service: DirectChatService, env: DirectChatHarness
) -> None:
    conversation = await _conversation(env)
    await env.blocks.block(UserBlock.create(ALICE, BOB))  # Alice blocks Bob

    with pytest.raises(ForbiddenError) as exc_info:
        await service.send_message(
            BOB, conversation.id, "hola", client_message_id=uuid.uuid4()
        )

    assert exc_info.value.code == USER_BLOCKED
    assert "rate" not in env.log
    _no_side_effects(env)


async def test_tg65_blocker_cannot_send_to_the_blocked_either(
    service: DirectChatService, env: DirectChatHarness
) -> None:
    conversation = await _conversation(env)
    await env.blocks.block(UserBlock.create(ALICE, BOB))

    with pytest.raises(ForbiddenError) as exc_info:
        await service.send_message(
            ALICE, conversation.id, "hola", client_message_id=uuid.uuid4()
        )

    assert exc_info.value.code == USER_BLOCKED
    _no_side_effects(env)


async def test_tg65_a_block_keeps_the_previous_history(
    service: DirectChatService, env: DirectChatHarness
) -> None:
    conversation = await _conversation(env)
    before = await service.send_message(
        ALICE, conversation.id, "abans", client_message_id=uuid.uuid4()
    )
    await env.blocks.block(UserBlock.create(BOB, ALICE))

    with pytest.raises(ForbiddenError):
        await service.send_message(
            ALICE, conversation.id, "despres", client_message_id=uuid.uuid4()
        )

    assert env.messages.messages == [before]


async def test_tg65_a_stranger_gets_conversation_not_found_and_touches_nothing(
    service: DirectChatService, env: DirectChatHarness
) -> None:
    conversation = await _conversation(env)
    env.log.clear()

    with pytest.raises(NotFoundError) as exc_info:
        await service.send_message(
            EVE, conversation.id, "hola", client_message_id=uuid.uuid4()
        )

    assert exc_info.value.code == CONVERSATION_NOT_FOUND
    assert env.log == []
    _no_side_effects(env)


async def test_tg65_unknown_conversation_is_not_found(
    service: DirectChatService, env: DirectChatHarness
) -> None:
    with pytest.raises(NotFoundError) as exc_info:
        await service.send_message(
            ALICE, uuid.uuid7(), "hola", client_message_id=uuid.uuid4()
        )

    assert exc_info.value.code == CONVERSATION_NOT_FOUND
    assert env.log == []
    _no_side_effects(env)


# --- pub/sub down and idempotency (criteris 6, 10) ----------------------------


async def test_tg65_pubsub_down_keeps_the_stored_message_and_the_retry_redelivers(
    service: DirectChatService, env: DirectChatHarness
) -> None:
    conversation = await _conversation(env)
    client_id = uuid.uuid4()
    env.broadcaster.fail = True

    with pytest.raises(ExternalServiceError) as exc_info:
        await service.send_message(
            ALICE, conversation.id, "hola", client_message_id=client_id
        )

    assert exc_info.value.code == PUBSUB_UNAVAILABLE
    assert len(env.messages.messages) == 1
    stored = env.messages.messages[0]
    env.broadcaster.fail = False
    env.log.clear()

    retried = await service.send_message(
        ALICE, conversation.id, "hola", client_message_id=client_id
    )

    assert retried == stored
    assert env.messages.messages == [stored]
    assert env.broadcaster.calls == [(stored, BOB, None)]
    assert "moderate" not in env.log
    assert "rate" not in env.log
    assert "save" not in env.log


async def test_tg65_a_repeated_client_message_id_returns_the_stored_one(
    service: DirectChatService, env: DirectChatHarness
) -> None:
    conversation = await _conversation(env)
    client_id = uuid.uuid4()
    first = await service.send_message(
        ALICE, conversation.id, "hola", client_message_id=client_id
    )
    env.log.clear()

    second = await service.send_message(
        ALICE, conversation.id, "hola", client_message_id=client_id
    )

    assert second == first
    assert env.messages.messages == [first]
    assert "rate" not in env.log
    assert "moderate" not in env.log
    assert "save" not in env.log


@pytest.mark.parametrize("other", ["another_conversation", "another_text"])
async def test_tg65_a_reused_client_message_id_with_other_content_is_a_conflict(
    service: DirectChatService, env: DirectChatHarness, other: str
) -> None:
    # Imported here so only this test fails (not the whole module) until it exists.
    from app.domain.direct_chat.errors import DIRECT_IDEMPOTENCY_CONFLICT

    conversation = await _conversation(env)
    other_conversation, _ = await env.conversations.get_or_create(ALICE, EVE)
    client_id = uuid.uuid4()
    first = await service.send_message(
        ALICE, conversation.id, "hola", client_message_id=client_id
    )
    env.log.clear()
    env.broadcaster.calls.clear()

    target = other_conversation if other == "another_conversation" else conversation
    text = "hola" if other == "another_conversation" else " altre text "
    with pytest.raises(ConflictError) as exc_info:
        await service.send_message(ALICE, target.id, text, client_message_id=client_id)

    assert exc_info.value.code == DIRECT_IDEMPOTENCY_CONFLICT
    assert "rate" not in env.log
    assert "moderate" not in env.log
    assert "save" not in env.log
    assert "deliver" not in env.log
    assert env.messages.messages == [first]
    assert env.broadcaster.calls == []


# --- offline recipient (criteri 5) --------------------------------------------


async def test_tg65_recipient_without_connections_gets_a_push(
    service: DirectChatService, env: DirectChatHarness
) -> None:
    conversation = await _conversation(env)
    env.broadcaster.recipients = 0

    message = await service.send_message(
        ALICE, conversation.id, "hola", client_message_id=uuid.uuid4()
    )

    assert env.push.sent == [(BOB, message)]
