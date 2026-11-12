import json
import uuid
from datetime import UTC, datetime, timedelta

import pytest

from app.application.chat.chat_service import ChatService
from app.application.chat.errors import RateLimitedError
from app.application.realtime.errors import RATE_LIMITED
from app.application.shared.errors import ExternalServiceError, ForbiddenError
from app.domain.chat.errors import CHAT_INVALID_CURSOR, CHAT_INVALID_LIMIT
from app.domain.chat.models import ChatMessage
from app.domain.shared.errors import (
    BusinessRuleViolation,
    NotFoundError,
    ValidationError,
)
from tests.fakes.chat import ChatFakes


@pytest.fixture
def env() -> ChatFakes:
    return ChatFakes()


@pytest.fixture
def service(env: ChatFakes) -> ChatService:
    return ChatService(env, env, env, env, env)


async def test_tg439_send_flow_and_cleaned_text(
    service: ChatService, env: ChatFakes
) -> None:
    message = await service.send_message(env.user, env.event, " hola ")
    assert message.text == "hola"
    assert env.calls == ["room", "subscription", "rate", "moderate", "save", "publish"]
    assert env.messages == [message]
    assert env.channels == [f"room:chat:event:{env.event}"]
    envelope = json.loads(env.published[0])
    assert envelope["from"] is None
    assert envelope["frame"]["type"] == "message"
    assert envelope["frame"]["room"] == f"chat:event:{env.event}"
    assert envelope["frame"]["payload"] == message.model_dump(mode="json")


async def test_tg439_validation_stops_before_rate(
    service: ChatService, env: ChatFakes
) -> None:
    with pytest.raises(ValidationError):
        await service.send_message(env.user, env.event, "  ")
    assert env.calls == ["room", "subscription"]


async def test_tg439_forbidden_prevents_access(
    service: ChatService, env: ChatFakes
) -> None:
    env.subscribed = False
    with pytest.raises(ForbiddenError):
        await service.send_message(env.user, env.event, "hello")
    assert env.calls == ["room", "subscription"]
    assert not env.messages and not env.published
    with pytest.raises(ForbiddenError):
        await service.history(env.user, env.event)


async def test_tg439_rate_limit_stops_flow(
    service: ChatService, env: ChatFakes
) -> None:
    env.allowed = False
    with pytest.raises(RateLimitedError) as error:
        await service.send_message(env.user, env.event, "hello")
    assert error.value.code == RATE_LIMITED
    assert env.calls == ["room", "subscription", "rate"]


async def test_tg439_rejection_stops_flow(service: ChatService, env: ChatFakes) -> None:
    env.approved = False
    with pytest.raises(BusinessRuleViolation) as error:
        await service.send_message(env.user, env.event, "hello")
    assert error.value.code == "CHAT_MESSAGE_REJECTED"
    assert env.calls == ["room", "subscription", "rate", "moderate"]
    assert not env.messages and not env.published


async def test_tg442_save_failure_does_not_publish(
    service: ChatService, env: ChatFakes
) -> None:
    env.fail_save = True
    with pytest.raises(ExternalServiceError):
        await service.send_message(env.user, env.event, "hello")
    assert "publish" not in env.calls
    assert not env.messages and not env.published


async def test_tg442_publish_failure_keeps_message_with_stable_code(
    service: ChatService, env: ChatFakes
) -> None:
    env.fail_publish = True
    with pytest.raises(ExternalServiceError) as error:
        await service.send_message(env.user, env.event, "hello")
    assert error.value.code == "PUBSUB_UNAVAILABLE"
    assert env.calls[-2:] == ["save", "publish"]
    assert [m.text for m in env.messages] == ["hello"]


async def test_tg439_missing_event_is_404_before_subscription(
    service: ChatService, env: ChatFakes
) -> None:
    env.missing = True
    env.subscribed = False
    with pytest.raises(NotFoundError):
        await service.send_message(env.user, env.event, "hello")
    assert env.calls == ["room"]


async def test_tg439_room_idempotent_and_missing(
    service: ChatService, env: ChatFakes
) -> None:
    first = await service.get_or_create_room(env.user, env.event)
    second = await service.get_or_create_room(env.user, env.event)
    assert second == first
    env.missing = True
    with pytest.raises(NotFoundError):
        await service.get_or_create_room(env.user, env.event)


async def test_tg439_cursor_order_and_limits(
    service: ChatService, env: ChatFakes
) -> None:
    room = await service.get_or_create_room(env.user, env.event)
    now = datetime.now(UTC)
    env.messages = [
        ChatMessage(
            id=uuid.uuid7(),
            room_id=room.id,
            author_id=env.user,
            text=str(i),
            sent_at=now + timedelta(seconds=i // 2),
        )
        for i in range(55)
    ]
    first = await service.history(env.user, env.event)
    second = await service.history(env.user, env.event, before=first.next_cursor)
    assert len(first.messages) == 50
    assert first.next_cursor is not None
    assert second.next_cursor is None
    assert [m.id for m in first.messages + second.messages] == [
        m.id
        for m in sorted(env.messages, key=lambda m: (m.sent_at, m.id), reverse=True)
    ]
    for cursor in ["bad!", "", "YWJj"]:
        with pytest.raises(ValidationError) as cursor_error:
            await service.history(env.user, env.event, before=cursor)
        assert cursor_error.value.code == CHAT_INVALID_CURSOR
    for limit in [0, 51]:
        with pytest.raises(ValidationError) as limit_error:
            await service.history(env.user, env.event, limit=limit)
        assert limit_error.value.code == CHAT_INVALID_LIMIT


async def test_tg439_list_only_subscribed(service: ChatService, env: ChatFakes) -> None:
    await service.get_or_create_room(env.user, env.event)
    rooms = await service.list_rooms(env.user)
    assert [r.room.event_id for r in rooms] == [env.event]
    assert await service.list_rooms(uuid.uuid7()) == []


def test_tg442_rate_limit_maps_to_http_429() -> None:
    from app.infrastructure.api.error_handlers import resolve_status

    assert resolve_status(RateLimitedError("RATE_LIMITED")) == 429


async def test_tg439_deep_cursor_is_validation_error(
    service: ChatService, env: ChatFakes
) -> None:
    import base64

    cursor = (
        base64.urlsafe_b64encode(("[" * 2000 + "]" * 2000).encode())
        .decode()
        .rstrip("=")
    )
    with pytest.raises(ValidationError):
        await service.history(env.user, env.event, before=cursor)
