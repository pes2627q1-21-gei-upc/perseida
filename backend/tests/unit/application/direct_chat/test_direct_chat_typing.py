"""TG-65: typing notifications are authorized by the application service."""

import uuid

import pytest

from app.application.direct_chat.direct_chat_service import DirectChatService
from app.application.shared.errors import ForbiddenError
from app.domain.direct_chat.errors import CONVERSATION_NOT_FOUND, USER_BLOCKED
from app.domain.direct_chat.models import UserBlock
from app.domain.shared.errors import NotFoundError
from tests.fakes.direct_chat import DirectChatHarness

ALICE = uuid.uuid7()
BOB = uuid.uuid7()
EVE = uuid.uuid7()


@pytest.fixture
def env() -> DirectChatHarness:
    return DirectChatHarness()


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


async def test_tg65_typing_recipient_is_the_other_participant(
    service: DirectChatService, env: DirectChatHarness
) -> None:
    conversation, _ = await env.conversations.get_or_create(ALICE, BOB)

    assert await service.typing_recipient(ALICE, conversation.id) == BOB
    assert await service.typing_recipient(BOB, conversation.id) == ALICE


async def test_tg65_typing_in_an_unknown_conversation_is_not_found(
    service: DirectChatService,
) -> None:
    with pytest.raises(NotFoundError) as exc_info:
        await service.typing_recipient(ALICE, uuid.uuid4())

    assert exc_info.value.code == CONVERSATION_NOT_FOUND


async def test_tg65_a_stranger_cannot_signal_typing(
    service: DirectChatService, env: DirectChatHarness
) -> None:
    conversation, _ = await env.conversations.get_or_create(ALICE, BOB)

    with pytest.raises(NotFoundError) as exc_info:
        await service.typing_recipient(EVE, conversation.id)

    assert exc_info.value.code == CONVERSATION_NOT_FOUND


@pytest.mark.parametrize("blocker", [ALICE, BOB])
async def test_tg65_a_block_in_either_direction_forbids_typing(
    service: DirectChatService, env: DirectChatHarness, blocker: uuid.UUID
) -> None:
    conversation, _ = await env.conversations.get_or_create(ALICE, BOB)
    blocked = BOB if blocker == ALICE else ALICE
    await env.blocks.block(UserBlock.create(blocker, blocked))

    for user in (ALICE, BOB):
        with pytest.raises(ForbiddenError) as exc_info:
            await service.typing_recipient(user, conversation.id)
        assert exc_info.value.code == USER_BLOCKED
