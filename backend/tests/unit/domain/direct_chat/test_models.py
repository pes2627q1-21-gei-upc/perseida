import uuid
from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError as PydanticValidationError

from app.domain.direct_chat.errors import (
    CANNOT_MESSAGE_SELF,
    MESSAGE_MAX_LENGTH,
    NOT_A_PARTICIPANT,
    VALIDATION_ERROR,
)
from app.domain.direct_chat.models import (
    DirectConversation,
    DirectMessage,
    UserBlock,
)
from app.domain.shared.errors import BusinessRuleViolation, ValidationError

USER_1 = uuid.uuid7()
USER_2 = uuid.uuid7()
STRANGER = uuid.uuid7()
T0 = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)


def _conversation() -> DirectConversation:
    return DirectConversation.create(USER_1, USER_2)


def _read_mark(conversation: DirectConversation, user_id: uuid.UUID) -> datetime | None:
    if conversation.user_a_id == user_id:
        return conversation.user_a_read_at
    return conversation.user_b_read_at


def _message(
    text: str = "hola",
    *,
    conversation_id: uuid.UUID | None = None,
    sender_id: uuid.UUID = USER_1,
    sent_at: datetime | None = None,
) -> DirectMessage:
    message = DirectMessage.create(
        conversation_id=conversation_id or uuid.uuid7(),
        sender_id=sender_id,
        text=text,
        client_message_id=uuid.uuid4(),
    )
    if sent_at is not None:
        message = message.model_copy(update={"sent_at": sent_at})
    return message


def test_limits_and_codes_are_fixed() -> None:
    # TG-65 criteri 7: límit i codis estables
    assert MESSAGE_MAX_LENGTH == 1000
    assert CANNOT_MESSAGE_SELF == "CANNOT_MESSAGE_SELF"
    assert VALIDATION_ERROR == "VALIDATION_ERROR"
    assert NOT_A_PARTICIPANT == "NOT_A_PARTICIPANT"


# --- DirectConversation -----------------------------------------------------


def test_create_conversation_orders_the_pair() -> None:
    # TG-65 criteri 1/3: user_a_id < user_b_id sempre
    low, high = sorted([USER_1, USER_2])

    conversation = _conversation()

    assert conversation.user_a_id == low
    assert conversation.user_b_id == high


def test_create_conversation_is_symmetric() -> None:
    # TG-65 criteri 1/3: (A,B) i (B,A) són la mateixa parella
    forward = DirectConversation.create(USER_1, USER_2)
    backward = DirectConversation.create(USER_2, USER_1)

    assert (forward.user_a_id, forward.user_b_id) == (
        backward.user_a_id,
        backward.user_b_id,
    )


def test_create_conversation_generates_uuid_v7_id_and_utc_created_at() -> None:
    # TG-65 criteri 1: id UUIDv7 (ADR-0023) i data en UTC
    before = datetime.now(UTC)
    conversation = _conversation()
    after = datetime.now(UTC)

    assert conversation.id.version == 7
    assert conversation.created_at.utcoffset() == UTC.utcoffset(None)
    assert before <= conversation.created_at <= after


def test_new_conversation_has_no_read_marks() -> None:
    # TG-65 criteri 11: sense marques de llegit al principi
    conversation = _conversation()

    assert conversation.user_a_read_at is None
    assert conversation.user_b_read_at is None


def test_cannot_open_a_conversation_with_oneself() -> None:
    # TG-65 criteri 4: no es pot escriure a un mateix
    with pytest.raises(BusinessRuleViolation) as exc_info:
        DirectConversation.create(USER_1, USER_1)

    assert exc_info.value.code == CANNOT_MESSAGE_SELF


def test_conversation_is_frozen() -> None:
    conversation = _conversation()

    with pytest.raises(PydanticValidationError):
        conversation.user_a_read_at = T0  # type: ignore[misc]


def test_has_participant_is_true_only_for_the_two_users() -> None:
    # TG-65 criteri 3
    conversation = _conversation()

    assert conversation.has_participant(USER_1) is True
    assert conversation.has_participant(USER_2) is True
    assert conversation.has_participant(STRANGER) is False


def test_other_participant_returns_the_counterpart() -> None:
    # TG-65 criteri 3
    conversation = _conversation()

    assert conversation.other_participant(USER_1) == USER_2
    assert conversation.other_participant(USER_2) == USER_1


def test_other_participant_of_a_stranger_is_refused() -> None:
    # TG-65 criteri 3
    with pytest.raises(BusinessRuleViolation) as exc_info:
        _conversation().other_participant(STRANGER)

    assert exc_info.value.code == NOT_A_PARTICIPANT


def test_mark_read_returns_a_new_conversation_with_only_that_mark() -> None:
    # TG-65 criteri 11: la marca és per participant
    conversation = _conversation()

    updated = conversation.mark_read(conversation.user_a_id, T0)

    assert updated is not conversation
    assert updated.user_a_read_at == T0
    assert updated.user_b_read_at is None
    assert conversation.user_a_read_at is None


def test_mark_read_of_the_second_participant_only_touches_its_mark() -> None:
    # TG-65 criteri 11
    conversation = _conversation()

    updated = conversation.mark_read(conversation.user_b_id, T0)

    assert updated.user_b_read_at == T0
    assert updated.user_a_read_at is None


def test_mark_read_by_a_stranger_is_refused() -> None:
    # TG-65 criteri 3
    with pytest.raises(BusinessRuleViolation) as exc_info:
        _conversation().mark_read(STRANGER, T0)

    assert exc_info.value.code == NOT_A_PARTICIPANT


def test_mark_read_never_goes_backwards() -> None:
    # TG-65 criteri 11: una marca anterior no retrocedeix la que ja hi ha
    conversation = _conversation().mark_read(USER_1, T0)

    updated = conversation.mark_read(USER_1, T0 - timedelta(minutes=5))

    assert _read_mark(updated, USER_1) == T0


def test_mark_read_moves_forward() -> None:
    # TG-65 criteri 11
    conversation = _conversation().mark_read(USER_1, T0)
    later = T0 + timedelta(minutes=5)

    updated = conversation.mark_read(USER_1, later)

    assert _read_mark(updated, USER_1) == later


def test_message_of_the_other_is_unread_without_a_mark() -> None:
    # TG-65 criteri 11
    conversation = _conversation()
    message = _message(conversation_id=conversation.id, sender_id=USER_2, sent_at=T0)

    assert conversation.is_unread_for(USER_1, message) is True


def test_message_after_the_mark_is_unread() -> None:
    # TG-65 criteri 11
    conversation = _conversation().mark_read(USER_1, T0)
    message = _message(
        conversation_id=conversation.id,
        sender_id=USER_2,
        sent_at=T0 + timedelta(seconds=1),
    )

    assert conversation.is_unread_for(USER_1, message) is True


@pytest.mark.parametrize("delta", [timedelta(0), timedelta(seconds=-1)])
def test_message_at_or_before_the_mark_is_read(delta: timedelta) -> None:
    # TG-65 criteri 11: igual o anterior a la marca = llegit
    conversation = _conversation().mark_read(USER_1, T0)
    message = _message(
        conversation_id=conversation.id, sender_id=USER_2, sent_at=T0 + delta
    )

    assert conversation.is_unread_for(USER_1, message) is False


def test_own_message_is_never_unread() -> None:
    # TG-65 criteri 11
    conversation = _conversation()
    message = _message(conversation_id=conversation.id, sender_id=USER_1, sent_at=T0)

    assert conversation.is_unread_for(USER_1, message) is False


# --- DirectMessage ----------------------------------------------------------


def test_create_message_keeps_conversation_sender_and_text() -> None:
    # TG-65 criteri 1: un missatge pertany a una conversa i a un remitent
    conversation_id = uuid.uuid7()
    client_id = uuid.uuid4()

    message = DirectMessage.create(
        conversation_id=conversation_id,
        sender_id=USER_1,
        text="Quin cel tan clar!",
        client_message_id=client_id,
    )

    assert message.conversation_id == conversation_id
    assert message.sender_id == USER_1
    assert message.text == "Quin cel tan clar!"
    assert message.client_message_id == client_id


def test_create_message_generates_uuid_v7_id() -> None:
    # TG-65 criteri 1: id UUIDv7 (ADR-0023)
    message = _message()

    assert message.id.version == 7
    assert _message().id != message.id


def test_create_message_sets_sent_at_in_utc() -> None:
    # TG-65 criteri 1: el servidor assigna sent_at
    before = datetime.now(UTC)
    message = _message()
    after = datetime.now(UTC)

    assert message.sent_at.utcoffset() == UTC.utcoffset(None)
    assert before <= message.sent_at <= after


def test_message_text_is_stripped_and_keeps_inner_newlines() -> None:
    # TG-65 criteri 7: es retallen els espais dels extrems
    assert _message("  hola\nmón \n").text == "hola\nmón"


@pytest.mark.parametrize("text", ["", "   ", "\t\n  \r\n", "\x00", " \x00\x07 "])
def test_blank_message_is_rejected(text: str) -> None:
    # TG-65 criteri 7: buit, només espais o només caràcters de control
    with pytest.raises(ValidationError) as exc_info:
        _message(text)

    assert exc_info.value.code == VALIDATION_ERROR


def test_message_of_1000_characters_is_accepted() -> None:
    # TG-65 criteri 7: el límit és inclusiu
    assert len(_message("a" * 1000).text) == 1000


def test_message_of_1001_characters_is_rejected() -> None:
    # TG-65 criteri 7
    with pytest.raises(ValidationError) as exc_info:
        _message("a" * 1001)

    assert exc_info.value.code == VALIDATION_ERROR


def test_surrounding_blanks_do_not_count_towards_the_limit() -> None:
    # TG-65 criteri 7
    assert len(_message("  " + "a" * 1000 + " \n").text) == 1000


def test_message_is_frozen() -> None:
    message = _message()

    with pytest.raises(PydanticValidationError):
        message.text = "altre"  # type: ignore[misc]


# --- UserBlock --------------------------------------------------------------


def test_create_block_keeps_both_users_and_sets_created_at_in_utc() -> None:
    # TG-65 criteri 12: bloqueig direccional
    before = datetime.now(UTC)
    block = UserBlock.create(USER_1, USER_2)
    after = datetime.now(UTC)

    assert block.blocker_id == USER_1
    assert block.blocked_id == USER_2
    assert before <= block.created_at <= after
    assert block.created_at.utcoffset() == UTC.utcoffset(None)


def test_cannot_block_oneself() -> None:
    # TG-65 criteri 4/12
    with pytest.raises(BusinessRuleViolation) as exc_info:
        UserBlock.create(USER_1, USER_1)

    assert exc_info.value.code == CANNOT_MESSAGE_SELF


def test_block_is_frozen() -> None:
    block = UserBlock.create(USER_1, USER_2)

    with pytest.raises(PydanticValidationError):
        block.blocked_id = STRANGER  # type: ignore[misc]
