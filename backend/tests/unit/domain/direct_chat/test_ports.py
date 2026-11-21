import uuid
from datetime import UTC, datetime, timedelta

import pytest

from app.domain.direct_chat.errors import CANNOT_MESSAGE_SELF
from app.domain.direct_chat.models import DirectMessage
from app.domain.direct_chat.ports import (
    DirectConversationRepository,
    DirectMessageRepository,
    PushNotifier,
    UserBlockRepository,
)
from app.domain.shared.errors import BusinessRuleViolation
from tests.unit.domain.direct_chat.fakes import (
    InMemoryDirectConversationRepository,
    InMemoryDirectMessageRepository,
    InMemoryUserBlockRepository,
    RecordingPushNotifier,
)

USER_1 = uuid.uuid7()
USER_2 = uuid.uuid7()
USER_3 = uuid.uuid7()


def _message(
    conversation_id: uuid.UUID,
    sender_id: uuid.UUID = USER_1,
    *,
    client_message_id: uuid.UUID | None = None,
    sent_at: datetime | None = None,
) -> DirectMessage:
    message = DirectMessage.create(
        conversation_id=conversation_id,
        sender_id=sender_id,
        text="hola",
        client_message_id=client_message_id or uuid.uuid4(),
    )
    if sent_at is not None:
        message = message.model_copy(update={"sent_at": sent_at})
    return message


# --- DirectConversationRepository ------------------------------------------


async def test_the_same_conversation_is_returned_for_a_pair_in_any_order() -> None:
    # TG-65 criteri 1/3: una sola conversa per parella
    repository: DirectConversationRepository = InMemoryDirectConversationRepository()

    first, created_first = await repository.get_or_create(USER_1, USER_2)
    second, created_second = await repository.get_or_create(USER_2, USER_1)

    assert first == second
    assert created_first is True
    assert created_second is False


async def test_get_or_create_with_oneself_is_refused() -> None:
    # TG-65 criteri 4
    repository: DirectConversationRepository = InMemoryDirectConversationRepository()

    with pytest.raises(BusinessRuleViolation) as exc_info:
        await repository.get_or_create(USER_1, USER_1)

    assert exc_info.value.code == CANNOT_MESSAGE_SELF


async def test_get_returns_the_conversation_or_none() -> None:
    # TG-65 criteri 3
    repository: DirectConversationRepository = InMemoryDirectConversationRepository()
    conversation, _ = await repository.get_or_create(USER_1, USER_2)

    assert await repository.get(conversation.id) == conversation
    assert await repository.get(uuid.uuid7()) is None


async def test_mark_read_persists_and_returns_the_updated_conversation() -> None:
    # TG-65 criteri 11
    repository: DirectConversationRepository = InMemoryDirectConversationRepository()
    conversation, _ = await repository.get_or_create(USER_1, USER_2)
    at = datetime.now(UTC)

    updated = await repository.mark_read(conversation.id, conversation.user_a_id, at)

    assert updated.user_a_read_at == at
    assert updated.user_b_read_at is None
    assert await repository.get(conversation.id) == updated


async def test_list_of_returns_only_the_conversations_of_the_user() -> None:
    # TG-65 criteri 3
    repository: DirectConversationRepository = InMemoryDirectConversationRepository()
    mine, _ = await repository.get_or_create(USER_1, USER_2)
    also_mine, _ = await repository.get_or_create(USER_3, USER_1)
    await repository.get_or_create(USER_2, USER_3)

    listed = await repository.list_of(USER_1)

    assert {c.id for c in listed} == {mine.id, also_mine.id}


# --- DirectMessageRepository -----------------------------------------------


async def test_find_by_client_id_is_scoped_to_the_sender() -> None:
    # TG-65 criteri 1: idempotència per remitent
    repository: DirectMessageRepository = InMemoryDirectMessageRepository()
    message = _message(uuid.uuid7())
    await repository.add(message)

    found = await repository.find_by_client_id(USER_1, message.client_message_id)
    other_sender = await repository.find_by_client_id(USER_2, message.client_message_id)

    assert found == message
    assert other_sender is None


async def test_add_with_a_repeated_client_message_id_returns_the_existing() -> None:
    # TG-65 criteri 1: un reintent no desa un segon missatge
    repository: DirectMessageRepository = InMemoryDirectMessageRepository()
    conversation_id = uuid.uuid7()
    client_id = uuid.uuid4()
    first = _message(conversation_id, client_message_id=client_id)
    retry = _message(conversation_id, client_message_id=client_id)

    stored_first = await repository.add(first)
    stored_retry = await repository.add(retry)

    assert stored_first == first
    assert stored_retry == first
    page = await repository.page(conversation_id, before=None, limit=50)
    assert page.messages == [first]


async def test_history_pages_are_newest_first_without_gaps_or_repeats() -> None:
    # TG-65 criteri 1: el cursor és exclusiu, ordre (sent_at, id)
    repository: DirectMessageRepository = InMemoryDirectMessageRepository()
    conversation_id = uuid.uuid7()
    start = datetime(2026, 1, 1, tzinfo=UTC)
    sent = [
        _message(conversation_id, sent_at=start + timedelta(seconds=n))
        for n in range(5)
    ]
    for message in sent:
        await repository.add(message)

    first = await repository.page(conversation_id, before=None, limit=2)
    assert first.next_cursor is not None
    second = await repository.page(conversation_id, before=first.next_cursor, limit=2)
    assert second.next_cursor is not None
    third = await repository.page(conversation_id, before=second.next_cursor, limit=2)

    seen = [*first.messages, *second.messages, *third.messages]
    assert [m.id for m in seen] == [m.id for m in reversed(sent)]
    assert third.next_cursor is None


async def test_an_empty_conversation_has_an_empty_history() -> None:
    # TG-65 criteri 1
    repository: DirectMessageRepository = InMemoryDirectMessageRepository()

    page = await repository.page(uuid.uuid7(), before=None, limit=50)

    assert page.messages == []
    assert page.next_cursor is None


async def test_history_only_holds_the_messages_of_its_conversation() -> None:
    # TG-65 criteri 3
    repository: DirectMessageRepository = InMemoryDirectMessageRepository()
    conversation_id = uuid.uuid7()
    mine = _message(conversation_id)
    await repository.add(mine)
    await repository.add(_message(uuid.uuid7()))

    page = await repository.page(conversation_id, before=None, limit=50)

    assert page.messages == [mine]


async def test_count_unread_without_since_counts_every_message_of_the_other() -> None:
    # TG-65 criteri 11
    repository: DirectMessageRepository = InMemoryDirectMessageRepository()
    conversation_id = uuid.uuid7()
    await repository.add(_message(conversation_id, USER_2))
    await repository.add(_message(conversation_id, USER_2))
    await repository.add(_message(conversation_id, USER_1))

    assert await repository.count_unread(conversation_id, USER_1, since=None) == 2


async def test_count_unread_only_counts_messages_after_since() -> None:
    # TG-65 criteri 11
    repository: DirectMessageRepository = InMemoryDirectMessageRepository()
    conversation_id = uuid.uuid7()
    mark = datetime(2026, 1, 1, tzinfo=UTC)
    await repository.add(
        _message(conversation_id, USER_2, sent_at=mark - timedelta(seconds=1))
    )
    await repository.add(_message(conversation_id, USER_2, sent_at=mark))
    await repository.add(
        _message(conversation_id, USER_2, sent_at=mark + timedelta(seconds=1))
    )

    assert await repository.count_unread(conversation_id, USER_1, since=mark) == 1


# --- UserBlockRepository ---------------------------------------------------


async def test_block_is_directional() -> None:
    # TG-65 criteri 12: A bloqueja B no implica que B bloquegi A
    repository: UserBlockRepository = InMemoryUserBlockRepository()

    await repository.block(USER_1, USER_2)

    assert await repository.is_blocked(USER_1, USER_2) is True
    assert await repository.is_blocked(USER_2, USER_1) is False


async def test_block_is_idempotent() -> None:
    # TG-65 criteri 12
    repository: UserBlockRepository = InMemoryUserBlockRepository()

    await repository.block(USER_1, USER_2)
    await repository.block(USER_1, USER_2)

    assert await repository.is_blocked(USER_1, USER_2) is True


async def test_unblock_removes_the_block_and_is_idempotent() -> None:
    # TG-65 criteri 12
    repository: UserBlockRepository = InMemoryUserBlockRepository()
    await repository.block(USER_1, USER_2)

    await repository.unblock(USER_1, USER_2)
    await repository.unblock(USER_1, USER_2)

    assert await repository.is_blocked(USER_1, USER_2) is False


async def test_unblock_without_a_block_does_not_fail() -> None:
    # TG-65 criteri 12
    repository: UserBlockRepository = InMemoryUserBlockRepository()

    await repository.unblock(USER_1, USER_2)

    assert await repository.is_blocked(USER_1, USER_2) is False


# --- PushNotifier -----------------------------------------------------------


async def test_push_notifier_receives_recipient_and_message() -> None:
    # TG-65 criteri 13
    recorder = RecordingPushNotifier()
    notifier: PushNotifier = recorder
    message = _message(uuid.uuid7())

    await notifier.notify(USER_2, message)

    assert recorder.sent == [(USER_2, message)]
