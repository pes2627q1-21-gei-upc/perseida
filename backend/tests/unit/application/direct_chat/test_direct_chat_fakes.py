"""The in-memory direct message repository keeps the guarantees of the real one."""

import uuid
from datetime import UTC, datetime

from app.domain.direct_chat.models import DirectMessage
from tests.fakes.direct_chat import InMemoryDirectMessageRepository

CONVERSATION = uuid.uuid7()
ALICE = uuid.uuid7()
BOB = uuid.uuid7()
T0 = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)


def _message(sender: uuid.UUID, sent_at: datetime) -> DirectMessage:
    return DirectMessage(
        id=uuid.uuid7(),
        conversation_id=CONVERSATION,
        sender_id=sender,
        text="Hola",
        sent_at=sent_at,
        client_message_id=uuid.uuid7(),
    )


async def test_tg65_add_keeps_sent_at_strictly_increasing_per_conversation() -> None:
    repository = InMemoryDirectMessageRepository()

    first = await repository.add(_message(ALICE, T0))
    same_instant = await repository.add(_message(BOB, T0))
    earlier = await repository.add(_message(ALICE, T0.replace(minute=0, hour=11)))

    assert first.sent_at == T0
    assert same_instant.sent_at > first.sent_at
    assert earlier.sent_at > same_instant.sent_at
    assert [m.sent_at for m in repository.messages] == sorted(
        {m.sent_at for m in repository.messages}
    )


async def test_tg65_add_of_a_retry_returns_the_stored_message_unchanged() -> None:
    repository = InMemoryDirectMessageRepository()
    stored = await repository.add(_message(ALICE, T0))
    await repository.add(_message(BOB, T0))

    retry = await repository.add(stored.model_copy(update={"id": uuid.uuid7()}))

    assert retry == stored
    assert len(repository.messages) == 2


async def test_tg65_add_does_not_shift_a_message_in_another_conversation() -> None:
    repository = InMemoryDirectMessageRepository()
    await repository.add(_message(ALICE, T0))
    other = _message(ALICE, T0).model_copy(update={"conversation_id": uuid.uuid7()})

    stored = await repository.add(other)

    assert stored.sent_at == T0
