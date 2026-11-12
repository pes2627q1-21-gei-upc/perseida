import uuid
from datetime import UTC, datetime, timedelta

import pytest

from app.application.chat.chat_service import ChatService
from app.application.shared.errors import ExternalServiceError, ForbiddenError
from app.domain.chat.models import ChatMessage
from app.domain.shared.errors import NotFoundError, ValidationError
from tests.fakes.chat import ChatFakes


@pytest.fixture
def env() -> ChatFakes:
    return ChatFakes()


@pytest.fixture
def service(env: ChatFakes) -> ChatService:
    return ChatService(env, env, env, env, env)


async def test_tg439_send_flow_and_cleaned_text(service: ChatService, env: ChatFakes) -> None:
    message = await service.send_message(env.user, env.event, ' hola ')
    assert message.text == 'hola'
    assert env.calls == ['subscription', 'room', 'rate', 'moderate', 'save', 'publish']
    assert env.messages == [message]
    assert env.published == [message]


async def test_tg439_validation_stops_before_rate(service: ChatService, env: ChatFakes) -> None:
    with pytest.raises(ValidationError):
        await service.send_message(env.user, env.event, '  ')
    assert env.calls == ['subscription', 'room']


async def test_tg439_forbidden_prevents_access(service: ChatService, env: ChatFakes) -> None:
    env.subscribed = False
    with pytest.raises(ForbiddenError):
        await service.send_message(env.user, env.event, 'hello')
    assert env.calls == ['subscription']
    with pytest.raises(ForbiddenError):
        await service.history(env.user, env.event)


async def test_tg439_rate_limit_stops_flow(service: ChatService, env: ChatFakes) -> None:
    env.allowed = False
    with pytest.raises(Exception) as error:
        await service.send_message(env.user, env.event, 'hello')
    assert error.value.code == 'RATE_LIMITED'
    assert env.calls == ['subscription', 'room', 'rate']


async def test_tg439_rejection_stops_flow(service: ChatService, env: ChatFakes) -> None:
    env.approved = False
    with pytest.raises(Exception) as error:
        await service.send_message(env.user, env.event, 'hello')
    assert error.value.code == 'CHAT_MESSAGE_REJECTED'
    assert env.calls == ['subscription', 'room', 'rate', 'moderate']
    assert not env.messages and not env.published


async def test_tg439_external_failure_is_propagated(service: ChatService, env: ChatFakes) -> None:
    env.fail = True
    with pytest.raises(ExternalServiceError):
        await service.send_message(env.user, env.event, 'hello')
    assert not env.messages and not env.published


async def test_tg439_room_idempotent_and_missing(service: ChatService, env: ChatFakes) -> None:
    assert await service.get_or_create_room(env.user, env.event) == await service.get_or_create_room(env.user, env.event)
    env.missing = True
    with pytest.raises(NotFoundError):
        await service.get_or_create_room(env.user, env.event)


async def test_tg439_cursor_order_and_limits(service: ChatService, env: ChatFakes) -> None:
    room = await service.get_or_create_room(env.user, env.event)
    now = datetime.now(UTC)
    env.messages = [ChatMessage(id=uuid.uuid7(), room_id=room.id, author_id=env.user, text=str(i), sent_at=now + timedelta(seconds=i // 2)) for i in range(55)]
    first = await service.history(env.user, env.event)
    second = await service.history(env.user, env.event, before=first.next_cursor)
    assert len(first.messages) == 50
    assert first.next_cursor is not None
    assert second.next_cursor is None
    assert [m.id for m in first.messages + second.messages] == [m.id for m in sorted(env.messages, key=lambda m: (m.sent_at, m.id), reverse=True)]
    for cursor in ['bad!', '', 'YWJj']:
        with pytest.raises(ValidationError):
            await service.history(env.user, env.event, before=cursor)
    for limit in [0, 51]:
        with pytest.raises(ValidationError):
            await service.history(env.user, env.event, limit=limit)


async def test_tg439_list_only_subscribed(service: ChatService, env: ChatFakes) -> None:
    await service.get_or_create_room(env.user, env.event)
    rooms = await service.list_rooms(env.user)
    assert [r.room.event_id for r in rooms] == [env.event]
    assert await service.list_rooms(uuid.uuid7()) == []
