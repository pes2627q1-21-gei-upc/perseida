import uuid

import pytest
from pydantic import ValidationError as PydanticValidationError

from app.application.chat.chat_service import ChatService
from app.domain.chat.errors import CHAT_MESSAGE_TOO_LONG
from app.domain.shared.errors import ValidationError
from app.infrastructure.chat.config import ChatSettings
from app.infrastructure.chat.moderator import ApproveAllModerator
from tests.fakes.chat import ChatFakes


@pytest.mark.parametrize("text", ["", "hello", "anything\n🔥"])
async def test_tg444_moderator_approves_all(text: str) -> None:
    assert (await ApproveAllModerator().moderate(text)).approved


def test_tg446_settings_defaults_and_bounds() -> None:
    settings = ChatSettings(_env_file=None)
    assert (
        settings.chat_rate_limit_messages,
        settings.chat_rate_limit_window_seconds,
        settings.chat_message_max_length,
    ) == (10, 10, 1000)
    for value in (0, 1001):
        with pytest.raises(PydanticValidationError):
            ChatSettings(_env_file=None, chat_message_max_length=value)


async def test_tg446_configured_maximum_checks_cleaned_text_before_rate() -> None:
    env = ChatFakes()
    service = ChatService(env, env, env, env, env, env, message_max_length=3)
    assert (
        await service.send_message(
            env.user, env.event, " abc ", client_message_id=uuid.uuid4()
        )
    ).text == "abc"
    env.calls.clear()
    with pytest.raises(ValidationError) as exc:
        await service.send_message(
            env.user, env.event, "abcd", client_message_id=uuid.uuid4()
        )
    assert exc.value.code == CHAT_MESSAGE_TOO_LONG
    assert "rate" not in env.calls
