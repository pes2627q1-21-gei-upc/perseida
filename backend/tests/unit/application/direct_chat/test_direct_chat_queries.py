"""TG-65 (task #403): list conversations, history, mark as read and block users."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest

from app.application.direct_chat.direct_chat_service import DirectChatService
from app.application.shared.cursor import encode_cursor
from app.domain.direct_chat.errors import (
    CANNOT_MESSAGE_SELF,
    CONVERSATION_NOT_FOUND,
    USER_BLOCKED,
    USER_NOT_FOUND,
    VALIDATION_ERROR,
)
from app.domain.direct_chat.models import DirectConversation, DirectMessage
from app.domain.shared.errors import (
    BusinessRuleViolation,
    NotFoundError,
    ValidationError,
)
from tests.fakes.direct_chat import DirectChatHarness

ALICE = uuid.uuid7()
BOB = uuid.uuid7()
EVE = uuid.uuid7()
T0 = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)


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


async def _conversation(
    env: DirectChatHarness, a: uuid.UUID, b: uuid.UUID, created_at: datetime = T0
) -> DirectConversation:
    low, high = sorted((a, b))
    conversation = DirectConversation(
        id=uuid.uuid7(), user_a_id=low, user_b_id=high, created_at=created_at
    )
    env.conversations.conversations[conversation.id] = conversation
    return conversation


async def _say(
    env: DirectChatHarness,
    conversation: DirectConversation,
    sender: uuid.UUID,
    seconds: int,
    text: str = "hola",
) -> DirectMessage:
    message = DirectMessage(
        id=uuid.uuid7(),
        conversation_id=conversation.id,
        sender_id=sender,
        text=text,
        sent_at=T0 + timedelta(seconds=seconds),
        client_message_id=uuid.uuid7(),
    )
    return await env.messages.add(message)


def _mark_of(conversation: DirectConversation, user: uuid.UUID) -> datetime | None:
    if conversation.user_a_id == user:
        return conversation.user_a_read_at
    return conversation.user_b_read_at


# --- list_conversations ------------------------------------------------------


async def test_tg65_list_orders_by_last_message_newest_first(
    env: DirectChatHarness, service: DirectChatService
) -> None:
    with_bob = await _conversation(env, ALICE, BOB)
    with_eve = await _conversation(env, ALICE, EVE)
    await _say(env, with_bob, BOB, 10, "primer")
    await _say(env, with_eve, EVE, 20, "mig")
    await _say(env, with_bob, ALICE, 30, "darrer")

    overview = await service.list_conversations(ALICE)

    assert [o.conversation_id for o in overview] == [with_bob.id, with_eve.id]
    assert overview[0].other_user_id == BOB
    assert overview[0].last_message_preview == "darrer"
    assert overview[0].last_message_at == T0 + timedelta(seconds=30)
    assert overview[0].last_message_sender_id == ALICE
    assert overview[0].created_at == with_bob.created_at
    assert overview[1].other_user_id == EVE


async def test_tg65_list_only_returns_conversations_of_the_user(
    env: DirectChatHarness, service: DirectChatService
) -> None:
    mine = await _conversation(env, ALICE, BOB)
    await _conversation(env, BOB, EVE)

    overview = await service.list_conversations(ALICE)

    assert [o.conversation_id for o in overview] == [mine.id]


async def test_tg65_list_truncates_a_long_preview_to_100_characters(
    env: DirectChatHarness, service: DirectChatService
) -> None:
    conversation = await _conversation(env, ALICE, BOB)
    await _say(env, conversation, BOB, 1, "x" * 101)

    (overview,) = await service.list_conversations(ALICE)

    assert overview.last_message_preview == "x" * 99 + "…"
    assert len(overview.last_message_preview or "") == 100


async def test_tg65_list_keeps_a_preview_of_exactly_100_characters(
    env: DirectChatHarness, service: DirectChatService
) -> None:
    conversation = await _conversation(env, ALICE, BOB)
    await _say(env, conversation, BOB, 1, "y" * 100)

    (overview,) = await service.list_conversations(ALICE)

    assert overview.last_message_preview == "y" * 100


async def test_tg65_list_unread_counter_grows_and_mark_read_resets_it(
    env: DirectChatHarness, service: DirectChatService
) -> None:
    conversation = await _conversation(env, ALICE, BOB)
    await _say(env, conversation, BOB, 1)
    await _say(env, conversation, BOB, 2)

    (before,) = await service.list_conversations(ALICE)
    assert before.unread_count == 2

    await service.mark_read_through(
        ALICE, conversation.id, env.messages.messages[-1].id
    )
    (after,) = await service.list_conversations(ALICE)
    assert after.unread_count == 0

    await _say(env, conversation, BOB, 3 * 86400)
    (newer,) = await service.list_conversations(ALICE)
    assert newer.unread_count == 1


async def test_tg65_list_own_messages_do_not_count_as_unread(
    env: DirectChatHarness, service: DirectChatService
) -> None:
    conversation = await _conversation(env, ALICE, BOB)
    await _say(env, conversation, ALICE, 1)
    await _say(env, conversation, ALICE, 2)
    await _say(env, conversation, BOB, 3)

    (mine,) = await service.list_conversations(ALICE)
    (his,) = await service.list_conversations(BOB)

    assert mine.unread_count == 1
    assert his.unread_count == 2


async def test_tg65_list_conversations_without_messages_go_by_created_at(
    env: DirectChatHarness, service: DirectChatService
) -> None:
    old = await _conversation(env, ALICE, BOB, T0)
    new = await _conversation(env, ALICE, EVE, T0 + timedelta(hours=1))

    overview = await service.list_conversations(ALICE)

    assert [o.conversation_id for o in overview] == [new.id, old.id]
    for item in overview:
        assert item.last_message_preview is None
        assert item.last_message_at is None
        assert item.last_message_sender_id is None
        assert item.unread_count == 0


async def test_tg65_list_mixes_empty_and_active_conversations_by_recency(
    env: DirectChatHarness, service: DirectChatService
) -> None:
    active = await _conversation(env, ALICE, BOB, T0)
    empty = await _conversation(env, ALICE, EVE, T0 + timedelta(seconds=5))
    await _say(env, active, BOB, 60)

    overview = await service.list_conversations(ALICE)

    assert [o.conversation_id for o in overview] == [active.id, empty.id]


async def test_tg65_list_blocked_by_me_only_for_who_blocks(
    env: DirectChatHarness, service: DirectChatService
) -> None:
    with_bob = await _conversation(env, ALICE, BOB)
    with_eve = await _conversation(env, ALICE, EVE)
    await _say(env, with_bob, BOB, 1)
    await _say(env, with_eve, EVE, 2)
    await service.block_user(ALICE, BOB)

    alice_view = {o.conversation_id: o for o in await service.list_conversations(ALICE)}
    bob_view = {o.conversation_id: o for o in await service.list_conversations(BOB)}

    assert alice_view[with_bob.id].blocked_by_me is True
    assert alice_view[with_eve.id].blocked_by_me is False
    # Bob is the blocked one: for him the flag is not set.
    assert bob_view[with_bob.id].blocked_by_me is False


@pytest.mark.parametrize("count", [0, 1, 5])
async def test_tg65_list_makes_one_call_per_port_whatever_the_conversations(
    env: DirectChatHarness, service: DirectChatService, count: int
) -> None:
    for _ in range(count):
        other = uuid.uuid7()
        env.users.existing.add(other)
        conversation = await _conversation(env, ALICE, other)
        await _say(env, conversation, other, 1)

    overview = await service.list_conversations(ALICE)

    assert len(overview) == count
    assert env.conversations.summaries_calls == 1
    assert env.blocks.blocked_among_calls == 1


# --- get_history -------------------------------------------------------------


async def _fill(
    env: DirectChatHarness, conversation: DirectConversation, count: int
) -> list[DirectMessage]:
    return [
        await _say(env, conversation, BOB if i % 2 else ALICE, i, f"m{i}")
        for i in range(count)
    ]


async def test_tg65_history_returns_the_newest_first_without_cursor(
    env: DirectChatHarness, service: DirectChatService
) -> None:
    conversation = await _conversation(env, ALICE, BOB)
    sent = await _fill(env, conversation, 3)

    page = await service.get_history(ALICE, conversation.id)

    assert [m.id for m in page.items] == [m.id for m in reversed(sent)]
    assert page.next_cursor is None


async def test_tg65_history_pages_with_an_opaque_cursor_without_overlap(
    env: DirectChatHarness, service: DirectChatService
) -> None:
    conversation = await _conversation(env, ALICE, BOB)
    sent = await _fill(env, conversation, 5)
    newest_first = [m.id for m in reversed(sent)]

    first = await service.get_history(ALICE, conversation.id, limit=2)
    assert [m.id for m in first.items] == newest_first[:2]
    assert isinstance(first.next_cursor, str)

    second = await service.get_history(
        ALICE, conversation.id, before=first.next_cursor, limit=2
    )
    assert [m.id for m in second.items] == newest_first[2:4]
    assert isinstance(second.next_cursor, str)

    third = await service.get_history(
        ALICE, conversation.id, before=second.next_cursor, limit=2
    )
    assert [m.id for m in third.items] == newest_first[4:]
    assert third.next_cursor is None


async def test_tg65_history_default_limit_is_50(
    env: DirectChatHarness, service: DirectChatService
) -> None:
    conversation = await _conversation(env, ALICE, BOB)
    await _fill(env, conversation, 55)

    page = await service.get_history(ALICE, conversation.id)

    assert len(page.items) == 50
    assert page.next_cursor is not None


async def test_tg65_history_accepts_the_limit_bounds(
    env: DirectChatHarness, service: DirectChatService
) -> None:
    conversation = await _conversation(env, ALICE, BOB)
    await _fill(env, conversation, 3)

    one = await service.get_history(ALICE, conversation.id, limit=1)
    top = await service.get_history(ALICE, conversation.id, limit=50)

    assert len(one.items) == 1
    assert len(top.items) == 3


@pytest.mark.parametrize("limit", [0, -1, 51, 1000])
async def test_tg65_history_rejects_a_limit_out_of_range(
    env: DirectChatHarness, service: DirectChatService, limit: int
) -> None:
    conversation = await _conversation(env, ALICE, BOB)

    with pytest.raises(ValidationError) as caught:
        await service.get_history(ALICE, conversation.id, limit=limit)

    assert caught.value.code == VALIDATION_ERROR


@pytest.mark.parametrize("cursor", ["not-a-cursor", "!!!", "", "e30"])
async def test_tg65_history_rejects_an_invalid_cursor(
    env: DirectChatHarness, service: DirectChatService, cursor: str
) -> None:
    conversation = await _conversation(env, ALICE, BOB)

    with pytest.raises(ValidationError) as caught:
        await service.get_history(ALICE, conversation.id, before=cursor)

    assert caught.value.code == VALIDATION_ERROR


async def test_tg65_history_accepts_a_well_formed_cursor(
    env: DirectChatHarness, service: DirectChatService
) -> None:
    conversation = await _conversation(env, ALICE, BOB)
    sent = await _fill(env, conversation, 3)
    cursor = encode_cursor(sent[1].sent_at, sent[1].id)

    page = await service.get_history(ALICE, conversation.id, before=cursor)

    assert [m.id for m in page.items] == [sent[0].id]


async def test_tg65_history_of_a_stranger_or_unknown_conversation_is_not_found(
    env: DirectChatHarness, service: DirectChatService
) -> None:
    conversation = await _conversation(env, ALICE, BOB)
    await _fill(env, conversation, 1)

    for user, conversation_id in (
        (EVE, conversation.id),
        (ALICE, uuid.uuid7()),
    ):
        with pytest.raises(NotFoundError) as caught:
            await service.get_history(user, conversation_id)
        assert caught.value.code == CONVERSATION_NOT_FOUND


async def test_tg65_blocking_does_not_hide_the_history(
    env: DirectChatHarness, service: DirectChatService
) -> None:
    conversation = await _conversation(env, ALICE, BOB)
    sent = await _fill(env, conversation, 3)
    await service.block_user(ALICE, BOB)

    mine = await service.get_history(ALICE, conversation.id)
    his = await service.get_history(BOB, conversation.id)

    assert len(mine.items) == len(his.items) == len(sent)


# --- mark_read ---------------------------------------------------------------


async def test_tg65_mark_read_moves_the_mark_to_the_message_for_the_participant(
    env: DirectChatHarness, service: DirectChatService
) -> None:
    conversation = await _conversation(env, ALICE, BOB)
    await _say(env, conversation, BOB, 1)

    await service.mark_read_through(
        ALICE, conversation.id, env.messages.messages[-1].id
    )

    stored = env.conversations.conversations[conversation.id]
    assert _mark_of(stored, ALICE) == env.messages.messages[-1].sent_at
    assert _mark_of(stored, BOB) is None


async def test_tg65_mark_read_does_not_affect_the_other_participant(
    env: DirectChatHarness, service: DirectChatService
) -> None:
    conversation = await _conversation(env, ALICE, BOB)
    await _say(env, conversation, ALICE, 1)
    await _say(env, conversation, BOB, 2)

    await service.mark_read_through(
        ALICE, conversation.id, env.messages.messages[-1].id
    )

    (alice_view,) = await service.list_conversations(ALICE)
    (bob_view,) = await service.list_conversations(BOB)
    assert alice_view.unread_count == 0
    assert bob_view.unread_count == 1


async def test_tg65_mark_read_is_idempotent_and_never_goes_backwards(
    env: DirectChatHarness, service: DirectChatService
) -> None:
    conversation = await _conversation(env, ALICE, BOB)
    await _say(env, conversation, BOB, 1)
    await service.mark_read_through(
        ALICE, conversation.id, env.messages.messages[-1].id
    )
    later = env.messages.messages[-1].sent_at

    await service.mark_read_through(
        ALICE, conversation.id, env.messages.messages[-1].id
    )
    await service.mark_read_through(
        ALICE, conversation.id, env.messages.messages[-1].id
    )

    stored = env.conversations.conversations[conversation.id]
    assert _mark_of(stored, ALICE) == later
    (view,) = await service.list_conversations(ALICE)
    assert view.unread_count == 0


async def test_tg65_mark_read_of_a_stranger_or_unknown_conversation_is_not_found(
    env: DirectChatHarness, service: DirectChatService
) -> None:
    conversation = await _conversation(env, ALICE, BOB)

    for user, conversation_id in (
        (EVE, conversation.id),
        (ALICE, uuid.uuid7()),
    ):
        with pytest.raises(NotFoundError) as caught:
            await service.mark_read_through(user, conversation_id, uuid.uuid7())
        assert caught.value.code == CONVERSATION_NOT_FOUND

    stored = env.conversations.conversations[conversation.id]
    assert stored.user_a_read_at is None
    assert stored.user_b_read_at is None


# --- block_user / unblock_user -----------------------------------------------


async def test_tg65_block_stores_a_directional_block(
    env: DirectChatHarness, service: DirectChatService
) -> None:
    await service.block_user(ALICE, BOB)

    assert await env.blocks.is_blocked(ALICE, BOB) is True
    assert await env.blocks.is_blocked(BOB, ALICE) is False


async def test_tg65_block_is_idempotent(
    env: DirectChatHarness, service: DirectChatService
) -> None:
    await service.block_user(ALICE, BOB)
    await service.block_user(ALICE, BOB)

    assert env.blocks.blocks == {(ALICE, BOB)}


async def test_tg65_block_yourself_is_a_business_rule_violation(
    env: DirectChatHarness, service: DirectChatService
) -> None:
    with pytest.raises(BusinessRuleViolation) as caught:
        await service.block_user(ALICE, ALICE)

    assert caught.value.code == CANNOT_MESSAGE_SELF
    assert env.blocks.blocks == set()


async def test_tg65_block_an_unknown_user_is_not_found(
    env: DirectChatHarness, service: DirectChatService
) -> None:
    with pytest.raises(NotFoundError) as caught:
        await service.block_user(ALICE, uuid.uuid7())

    assert caught.value.code == USER_NOT_FOUND
    assert env.blocks.blocks == set()


async def test_tg65_unblock_removes_the_block_and_is_idempotent(
    env: DirectChatHarness, service: DirectChatService
) -> None:
    await service.block_user(ALICE, BOB)

    await service.unblock_user(ALICE, BOB)
    await service.unblock_user(ALICE, BOB)

    assert env.blocks.blocks == set()


async def test_tg65_unblock_does_not_check_that_the_user_exists(
    env: DirectChatHarness, service: DirectChatService
) -> None:
    await service.unblock_user(ALICE, uuid.uuid7())

    assert "directory" not in env.log


async def test_tg65_a_block_stops_sending_both_ways_and_unblock_restores_it(
    env: DirectChatHarness, service: DirectChatService
) -> None:
    conversation = await _conversation(env, ALICE, BOB)
    await service.block_user(ALICE, BOB)

    for sender in (ALICE, BOB):
        with pytest.raises(Exception) as caught:
            await service.send_message(
                sender, conversation.id, "hola", client_message_id=uuid.uuid7()
            )
        assert getattr(caught.value, "code", None) == USER_BLOCKED

    await service.unblock_user(ALICE, BOB)

    for sender in (ALICE, BOB):
        stored = await service.send_message(
            sender, conversation.id, "hola", client_message_id=uuid.uuid7()
        )
        assert stored.sender_id == sender


async def test_tg65_unblock_keeps_the_history(
    env: DirectChatHarness, service: DirectChatService
) -> None:
    conversation = await _conversation(env, ALICE, BOB)
    sent = await _fill(env, conversation, 2)
    await service.block_user(ALICE, BOB)
    await service.unblock_user(ALICE, BOB)

    page = await service.get_history(ALICE, conversation.id)

    assert len(page.items) == len(sent)
