import uuid

from app.domain.chat.models import ChatMessage
from app.domain.chat.ports import (
    ChatRepository,
    EventSubscriptions,
    MessageModerator,
    SendRateLimiter,
)
from tests.unit.domain.chat.fakes import (
    ApprovingModerator,
    CountingRateLimiter,
    InMemoryChatRepository,
    StaticSubscriptions,
)

USER_ID = uuid.uuid7()
EVENT_ID = uuid.uuid7()


async def test_the_same_room_is_returned_for_an_event() -> None:
    # TG-64 criteri 2: 0..1 sala per esdeveniment
    repository: ChatRepository = InMemoryChatRepository()

    first = await repository.get_or_create_room(EVENT_ID)
    second = await repository.get_or_create_room(EVENT_ID)

    assert first == second
    assert first.event_id == EVENT_ID


async def test_history_pages_are_newest_first_without_gaps_or_repeats() -> None:
    # TG-64 criteri 10: el cursor és exclusiu i ordre i cursor usen el mateix id
    repository: ChatRepository = InMemoryChatRepository()
    room = await repository.get_or_create_room(EVENT_ID)
    sent = [
        ChatMessage.create(room_id=room.id, author_id=USER_ID, text=f"missatge {n}")
        for n in range(5)
    ]
    for message in sent:
        await repository.add_message(message)

    first = await repository.page(room.id, before=None, limit=2)
    assert first.next_cursor is not None
    second = await repository.page(room.id, before=first.next_cursor, limit=2)
    assert second.next_cursor is not None
    third = await repository.page(room.id, before=second.next_cursor, limit=2)

    seen = [*first.messages, *second.messages, *third.messages]
    assert [m.id for m in seen] == [m.id for m in reversed(sent)]
    assert third.next_cursor is None


async def test_an_empty_room_has_an_empty_history() -> None:
    repository: ChatRepository = InMemoryChatRepository()
    room = await repository.get_or_create_room(EVENT_ID)

    page = await repository.page(room.id, before=None, limit=50)

    assert page.messages == []
    assert page.next_cursor is None


async def test_the_room_list_carries_the_latest_message() -> None:
    # TG-64 criteri 13
    repository: ChatRepository = InMemoryChatRepository()
    room = await repository.get_or_create_room(EVENT_ID)
    older = ChatMessage.create(room_id=room.id, author_id=USER_ID, text="primer")
    newer = ChatMessage.create(room_id=room.id, author_id=USER_ID, text="segon")
    await repository.add_message(older)
    await repository.add_message(newer)

    summaries = await repository.list_rooms_of(USER_ID)

    assert [s.last_message for s in summaries] == [newer]


async def test_moderator_approves_everything() -> None:
    # TG-64 criteri 6
    moderator: MessageModerator = ApprovingModerator()

    assert (await moderator.moderate("hola")).approved is True


async def test_rate_limiter_refuses_after_the_limit() -> None:
    # TG-64 criteri 8
    limiter: SendRateLimiter = CountingRateLimiter(limit=2)

    assert [await limiter.hit(USER_ID) for _ in range(3)] == [True, True, False]


async def test_only_subscribed_users_are_subscribed() -> None:
    # TG-64 criteri 3
    subscriptions: EventSubscriptions = StaticSubscriptions((USER_ID, EVENT_ID))

    assert await subscriptions.is_subscribed(USER_ID, EVENT_ID) is True
    assert await subscriptions.is_subscribed(uuid.uuid7(), EVENT_ID) is False
