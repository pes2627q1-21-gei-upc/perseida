"""SqlChatRepository against PostgreSQL for real (TG-448, ADR-0024): one room per
event, real foreign keys, history by cursor and rooms of a user.

Real commits (the concurrent test needs them). Each test cleans only its own
users, events, rooms and messages, so the database is left as it was found.
"""

import asyncio
import os
import random
import uuid
from collections.abc import AsyncIterator, Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from alembic.config import Config
from sqlalchemy import TextClause, text
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from alembic import command
from app.domain.chat.models import (
    ChatAuthor,
    ChatCursor,
    ChatMessage,
    EventChatRoom,
)
from app.domain.chat.ports import ChatRepository
from app.domain.events.errors import EVENT_NOT_FOUND
from app.domain.events.models import AstronomicalEvent, EventSubscription
from app.domain.shared.errors import NotFoundError
from app.domain.users.models import User
from app.infrastructure.chat.repository import SqlChatRepository
from app.infrastructure.events.subscription_repository import (
    SqlEventSubscriptionRepository,
)
from app.infrastructure.events.tables import AstronomicalEventRow
from app.infrastructure.persistence.config import DatabaseSettings
from app.infrastructure.users.repository import SqlUserRepository
from tests.factories.events import make_event
from tests.integration.isolation import row_counts

pytestmark = pytest.mark.skipif(
    not os.getenv("POSTGRES_HOST"),
    reason="PostgreSQL integration test requires POSTGRES_HOST",
)

NOW = datetime(2026, 11, 17, 21, 0, tzinfo=UTC)
PREFIX = "chat-repo"
# Explicit, without relying on the cascades these tests check.
DELETE_OWN_ROWS = (
    text(
        "DELETE FROM chat_messages WHERE room_id IN"
        " (SELECT id FROM event_chat_rooms WHERE event_id IN"
        " (SELECT id FROM astronomical_events WHERE external_id LIKE :prefix))"
    ),
    text(
        "DELETE FROM chat_messages WHERE author_id IN"
        " (SELECT id FROM users WHERE email LIKE :prefix)"
    ),
    text(
        "DELETE FROM event_chat_rooms WHERE event_id IN"
        " (SELECT id FROM astronomical_events WHERE external_id LIKE :prefix)"
    ),
    text(
        "DELETE FROM event_subscriptions WHERE user_id IN"
        " (SELECT id FROM users WHERE email LIKE :prefix)"
    ),
    text(
        "DELETE FROM user_identities WHERE user_id IN"
        " (SELECT id FROM users WHERE email LIKE :prefix)"
    ),
    text("DELETE FROM users WHERE email LIKE :prefix"),
    text("DELETE FROM astronomical_events WHERE external_id LIKE :prefix"),
)
COUNT_ROOMS_OF_EVENT = text(
    "SELECT count(*) FROM event_chat_rooms WHERE event_id = :event"
)
COUNT_ROOMS = text("SELECT count(*) FROM event_chat_rooms")


@pytest.fixture(scope="module", autouse=True)
def _schema_at_head() -> None:
    backend_dir = Path(__file__).resolve().parents[3]
    config = Config(str(backend_dir / "alembic.ini"))
    config.set_main_option("script_location", str(backend_dir / "alembic"))
    config.attributes["configure_logger"] = False
    command.upgrade(config, "head")


@pytest.fixture(scope="module", autouse=True)
def _preexisting_data_is_kept(_schema_at_head: None) -> Iterator[None]:
    before = row_counts()
    yield
    assert row_counts() == before


@pytest.fixture
async def engine() -> AsyncIterator[AsyncEngine]:
    engine = create_async_engine(DatabaseSettings().database_url)
    try:
        yield engine
    finally:
        async with engine.begin() as connection:
            for statement in DELETE_OWN_ROWS:
                await connection.execute(statement, {"prefix": f"{PREFIX}-%"})
        await engine.dispose()


@pytest.fixture
def sessions(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, expire_on_commit=False)


def _repository(sessions: async_sessionmaker[AsyncSession]) -> ChatRepository:
    repository: ChatRepository = SqlChatRepository(sessions)
    return repository


@pytest.fixture
def repo(sessions: async_sessionmaker[AsyncSession]) -> ChatRepository:
    return _repository(sessions)


async def _user(
    sessions: async_sessionmaker[AsyncSession], display_name: str | None = "Ada"
) -> User:
    unique = f"{PREFIX}-{uuid.uuid4().hex}"
    return await SqlUserRepository(sessions).add(
        User.create(
            google_sub=f"sub-{unique}",
            email=f"{unique}@example.test",
            display_name=display_name,
        )
    )


async def _event(
    sessions: async_sessionmaker[AsyncSession],
    starts_at: datetime = NOW + timedelta(days=1),
) -> AstronomicalEvent:
    event = make_event(starts_at)
    async with sessions() as session:
        session.add(
            AstronomicalEventRow(
                id=event.id,
                source="catalog",
                external_id=f"{PREFIX}-{event.id}",
                title=event.title,
                summary=event.summary,
                category=event.category.value,
                starts_at=event.starts_at,
                ends_at=event.ends_at,
                latitude=None,
                longitude=None,
                source_url=event.source_url,
            )
        )
        await session.commit()
    return event


async def _subscribe(
    sessions: async_sessionmaker[AsyncSession], user: User, event: AstronomicalEvent
) -> None:
    await SqlEventSubscriptionRepository(sessions).add(
        EventSubscription.create(user.id, event, NOW)
    )


def _message(
    room: EventChatRoom,
    author: User,
    sent_at: datetime,
    body: str = "Hola",
    client_message_id: uuid.UUID | None = None,
) -> ChatMessage:
    return ChatMessage(
        id=uuid.uuid7(),
        room_id=room.id,
        author=ChatAuthor(id=author.id, name=author.display_name),
        client_message_id=client_message_id or uuid.uuid4(),
        text=body,
        sent_at=sent_at,
    )


async def _room_with(
    repo: ChatRepository, sessions: async_sessionmaker[AsyncSession]
) -> EventChatRoom:
    return await repo.get_or_create_room((await _event(sessions)).id)


async def _count(
    engine: AsyncEngine, statement: TextClause, **params: uuid.UUID
) -> int:
    async with engine.connect() as connection:
        return int(await connection.scalar(statement, params) or 0)


async def test_tg448_c1_get_or_create_room_returns_the_same_room_each_time(
    repo: ChatRepository,
    sessions: async_sessionmaker[AsyncSession],
    engine: AsyncEngine,
) -> None:
    event = await _event(sessions)

    first = await repo.get_or_create_room(event.id)
    second = await repo.get_or_create_room(event.id)

    assert first == second
    assert first.event_id == event.id
    assert await _count(engine, COUNT_ROOMS_OF_EVENT, event=event.id) == 1


async def test_tg448_c1_concurrent_requests_end_up_with_a_single_room(
    repo: ChatRepository,
    sessions: async_sessionmaker[AsyncSession],
    engine: AsyncEngine,
) -> None:
    event = await _event(sessions)

    rooms = await asyncio.gather(
        *(repo.get_or_create_room(event.id) for _ in range(10))
    )

    assert len({room.id for room in rooms}) == 1
    assert await _count(engine, COUNT_ROOMS_OF_EVENT, event=event.id) == 1


async def test_tg448_c2_get_or_create_room_of_a_missing_event_is_not_found(
    repo: ChatRepository, engine: AsyncEngine
) -> None:
    before = await _count(engine, COUNT_ROOMS)

    with pytest.raises(NotFoundError) as error:
        await repo.get_or_create_room(uuid.uuid7())

    assert error.value.code == EVENT_NOT_FOUND
    assert await _count(engine, COUNT_ROOMS) == before


async def test_tg448_c2_require_event_checks_existence_without_creating_a_room(
    repo: ChatRepository,
    sessions: async_sessionmaker[AsyncSession],
    engine: AsyncEngine,
) -> None:
    event = await _event(sessions)

    await repo.require_event(event.id)
    with pytest.raises(NotFoundError) as error:
        await repo.require_event(uuid.uuid7())

    assert error.value.code == EVENT_NOT_FOUND
    assert await _count(engine, COUNT_ROOMS_OF_EVENT, event=event.id) == 0


async def test_tg448_c3_added_message_is_persisted_and_readable(
    repo: ChatRepository, sessions: async_sessionmaker[AsyncSession]
) -> None:
    author = await _user(sessions)
    room = await _room_with(repo, sessions)
    message = _message(room, author, NOW, "Quin cel més net")

    await repo.add_message(message)

    page = await repo.page(room.id, None, 50)
    assert page.messages == [message]
    assert page.next_cursor is None


async def test_tg448_c4_history_is_newest_first_by_cursor_without_gaps_or_repeats(
    repo: ChatRepository, sessions: async_sessionmaker[AsyncSession]
) -> None:
    author = await _user(sessions)
    room = await _room_with(repo, sessions)
    # Three messages share each timestamp: ties are broken by id.
    messages = [
        _message(room, author, NOW + timedelta(seconds=index // 3), f"m{index}")
        for index in range(120)
    ]
    expected = sorted(messages, key=lambda m: (m.sent_at, m.id), reverse=True)
    # Stored out of order: the order comes from the query, not from insertion.
    for message in random.Random(448).sample(messages, k=len(messages)):
        await repo.add_message(message)

    pages = []
    cursor: ChatCursor | None = None
    while True:
        page = await repo.page(room.id, cursor, 50)
        pages.append(page)
        if page.next_cursor is None:
            break
        cursor = page.next_cursor

    assert [len(page.messages) for page in pages] == [50, 50, 20]
    assert [m for page in pages for m in page.messages] == expected
    assert pages[0].next_cursor == ChatCursor(
        sent_at=expected[49].sent_at, id=expected[49].id
    )
    assert pages[-1].next_cursor is None


async def test_tg448_c4_before_is_exclusive(
    repo: ChatRepository, sessions: async_sessionmaker[AsyncSession]
) -> None:
    author = await _user(sessions)
    room = await _room_with(repo, sessions)
    messages = [
        _message(room, author, NOW + timedelta(seconds=index)) for index in range(3)
    ]
    for message in messages:
        await repo.add_message(message)
    newest, middle, oldest = reversed(messages)

    page = await repo.page(
        room.id, ChatCursor(sent_at=middle.sent_at, id=middle.id), 50
    )

    assert page.messages == [oldest]
    assert newest not in page.messages


async def test_tg448_add_message_to_a_room_that_does_not_exist_is_not_found(
    repo: ChatRepository, sessions: async_sessionmaker[AsyncSession]
) -> None:
    author = await _user(sessions)
    ghost = EventChatRoom(id=uuid.uuid7(), event_id=uuid.uuid7(), created_at=NOW)

    with pytest.raises(NotFoundError) as error:
        await repo.add_message(_message(ghost, author, NOW))

    assert error.value.code == "CHAT_ROOM_NOT_FOUND"


async def test_tg448_add_message_with_a_repeated_id_is_not_a_missing_room(
    repo: ChatRepository, sessions: async_sessionmaker[AsyncSession]
) -> None:
    room = await _room_with(repo, sessions)
    author = await _user(sessions)
    message = _message(room, author, NOW)
    await repo.add_message(message)
    # Same object again would be a legitimate idempotent retry (TG-654); a
    # repeated id with another key is the primary key conflict.
    same_id = message.model_copy(update={"client_message_id": uuid.uuid4()})

    with pytest.raises(IntegrityError, match="pk_chat_messages"):
        await repo.add_message(same_id)


async def test_tg448_c5_a_page_has_at_most_limit_messages_and_a_next_cursor(
    repo: ChatRepository, sessions: async_sessionmaker[AsyncSession]
) -> None:
    author = await _user(sessions)
    room = await _room_with(repo, sessions)
    for index in range(51):
        await repo.add_message(_message(room, author, NOW + timedelta(seconds=index)))

    page = await repo.page(room.id, None, 50)

    assert len(page.messages) == 50
    assert page.next_cursor == ChatCursor(
        sent_at=page.messages[-1].sent_at, id=page.messages[-1].id
    )


async def test_tg448_c5_a_page_that_ends_the_history_has_no_next_cursor(
    repo: ChatRepository, sessions: async_sessionmaker[AsyncSession]
) -> None:
    author = await _user(sessions)
    room = await _room_with(repo, sessions)
    for index in range(50):
        await repo.add_message(_message(room, author, NOW + timedelta(seconds=index)))

    page = await repo.page(room.id, None, 50)

    assert len(page.messages) == 50
    assert page.next_cursor is None


async def test_tg448_c6_an_empty_room_has_an_empty_page_and_no_cursor(
    repo: ChatRepository, sessions: async_sessionmaker[AsyncSession]
) -> None:
    room = await _room_with(repo, sessions)

    page = await repo.page(room.id, None, 50)

    assert page.messages == []
    assert page.next_cursor is None


async def test_tg448_c6_history_of_a_room_does_not_include_other_rooms(
    repo: ChatRepository, sessions: async_sessionmaker[AsyncSession]
) -> None:
    author = await _user(sessions)
    room, other = await _room_with(repo, sessions), await _room_with(repo, sessions)
    mine = _message(room, author, NOW)
    await repo.add_message(mine)
    await repo.add_message(_message(other, author, NOW + timedelta(seconds=1)))

    assert (await repo.page(room.id, None, 50)).messages == [mine]


async def test_tg448_c7_rooms_of_a_user_are_by_last_message_and_only_subscribed(
    repo: ChatRepository, sessions: async_sessionmaker[AsyncSession]
) -> None:
    me, other = await _user(sessions), await _user(sessions)
    old_event, new_event, silent_event, not_subscribed, not_mine = [
        await _event(sessions) for _ in range(5)
    ]
    for event in (old_event, new_event, silent_event):
        await _subscribe(sessions, me, event)
    await _subscribe(sessions, other, not_mine)
    old_room = await repo.get_or_create_room(old_event.id)
    new_room = await repo.get_or_create_room(new_event.id)
    silent_room = await repo.get_or_create_room(silent_event.id)
    await repo.get_or_create_room(not_subscribed.id)
    other_room = await repo.get_or_create_room(not_mine.id)
    old_last = _message(old_room, me, NOW + timedelta(minutes=1), "old")
    new_first = _message(new_room, other, NOW + timedelta(minutes=2), "first")
    new_last = _message(new_room, me, NOW + timedelta(minutes=3), "last")
    for message in (old_last, new_first, new_last):
        await repo.add_message(message)
    await repo.add_message(_message(other_room, other, NOW + timedelta(minutes=9)))

    summaries = await repo.list_rooms_of(me.id)

    assert [(s.room, s.last_message) for s in summaries] == [
        (new_room, new_last),
        (old_room, old_last),
        (silent_room, None),
    ]


async def test_tg448_c7_rooms_without_messages_go_last_newest_room_first(
    repo: ChatRepository, sessions: async_sessionmaker[AsyncSession]
) -> None:
    me = await _user(sessions)
    talking_event, first_event, second_event = [
        await _event(sessions) for _ in range(3)
    ]
    for event in (talking_event, first_event, second_event):
        await _subscribe(sessions, me, event)
    # The talking room is created last, yet it has the only message.
    first = await repo.get_or_create_room(first_event.id)
    second = await repo.get_or_create_room(second_event.id)
    talking = await repo.get_or_create_room(talking_event.id)
    await repo.add_message(_message(talking, me, NOW))

    summaries = await repo.list_rooms_of(me.id)

    assert [s.room.id for s in summaries] == [talking.id, second.id, first.id]


async def test_tg448_c7_a_user_without_subscriptions_has_no_rooms(
    repo: ChatRepository, sessions: async_sessionmaker[AsyncSession]
) -> None:
    me = await _user(sessions)
    await _room_with(repo, sessions)

    assert await repo.list_rooms_of(me.id) == []


async def test_tg448_c8_messages_survive_a_new_session_and_engine(
    repo: ChatRepository, sessions: async_sessionmaker[AsyncSession]
) -> None:
    author = await _user(sessions)
    room = await _room_with(repo, sessions)
    message = _message(room, author, NOW, "Es queda guardat")
    await repo.add_message(message)

    fresh_engine = create_async_engine(DatabaseSettings().database_url)
    try:
        fresh = _repository(async_sessionmaker(fresh_engine, expire_on_commit=False))
        page = await fresh.page(room.id, None, 50)
    finally:
        await fresh_engine.dispose()

    assert page.messages == [message]


INSERT_RAW_MESSAGE = text(
    "INSERT INTO chat_messages"
    " (id, room_id, author_id, client_message_id, text, sent_at)"
    " VALUES (:id, :room, :author, :client_message_id, :body, :sent_at)"
)


async def _insert_raw(
    engine: AsyncEngine, room: EventChatRoom, author: User, length: int
) -> None:
    # Straight into the table, bypassing the domain.
    async with engine.begin() as connection:
        await connection.execute(
            INSERT_RAW_MESSAGE,
            {
                "id": uuid.uuid7(),
                "room": room.id,
                "author": author.id,
                "client_message_id": uuid.uuid4(),
                "body": "a" * length,
                "sent_at": NOW,
            },
        )


@pytest.mark.parametrize("length", [1, 1000])
async def test_tg448_check_text_length_accepts_the_limits(
    sessions: async_sessionmaker[AsyncSession],
    engine: AsyncEngine,
    repo: ChatRepository,
    length: int,
) -> None:
    room = await _room_with(repo, sessions)
    author = await _user(sessions)

    await _insert_raw(engine, room, author, length)

    page = await repo.page(room.id, None, 10)
    assert [len(message.text) for message in page.messages] == [length]


async def test_tg448_check_text_length_rejects_an_empty_text(
    sessions: async_sessionmaker[AsyncSession],
    engine: AsyncEngine,
    repo: ChatRepository,
) -> None:
    room = await _room_with(repo, sessions)
    author = await _user(sessions)

    with pytest.raises(IntegrityError, match="ck_chat_messages_text_length"):
        await _insert_raw(engine, room, author, 0)

    assert (await repo.page(room.id, None, 10)).messages == []


async def test_tg448_the_database_rejects_a_text_of_1001_characters(
    sessions: async_sessionmaker[AsyncSession],
    engine: AsyncEngine,
    repo: ChatRepository,
) -> None:
    # The maximum is enforced by the column type (varchar(1000)), not the CHECK.
    room = await _room_with(repo, sessions)
    author = await _user(sessions)

    with pytest.raises(DBAPIError, match="value too long for type"):
        await _insert_raw(engine, room, author, 1001)

    assert (await repo.page(room.id, None, 10)).messages == []


# --- TG-654: client_message_id (idempotencia) ----------------------------------

INSERT_KEYED_MESSAGE = text(
    "INSERT INTO chat_messages"
    " (id, room_id, author_id, client_message_id, text, sent_at)"
    " VALUES (:id, :room_id, :author_id, :client_message_id, 'x', :sent_at)"
)
COUNT_KEYED = text(
    "SELECT count(*) FROM chat_messages"
    " WHERE author_id = :author_id AND client_message_id = :client_message_id"
)


async def test_tg654_find_by_client_id_returns_the_stored_message(
    repo: ChatRepository, sessions: async_sessionmaker[AsyncSession]
) -> None:
    author = await _user(sessions)
    room = await _room_with(repo, sessions)
    key = uuid.uuid4()
    message = _message(room, author, NOW, "Hola", key)
    assert await repo.add_message(message) == message

    assert await repo.find_by_client_id(author.id, key) == message


async def test_tg654_find_by_client_id_of_an_unknown_key_is_none(
    repo: ChatRepository, sessions: async_sessionmaker[AsyncSession]
) -> None:
    author = await _user(sessions)
    room = await _room_with(repo, sessions)
    await repo.add_message(_message(room, author, NOW))

    assert await repo.find_by_client_id(author.id, uuid.uuid4()) is None


async def test_tg654_the_same_key_of_another_author_is_not_found_and_is_stored(
    repo: ChatRepository, sessions: async_sessionmaker[AsyncSession]
) -> None:
    ada, bob = await _user(sessions), await _user(sessions)
    room = await _room_with(repo, sessions)
    key = uuid.uuid4()
    mine = _message(room, ada, NOW, "d'Ada", key)
    theirs = _message(room, bob, NOW + timedelta(seconds=1), "de Bob", key)

    await repo.add_message(mine)
    assert await repo.find_by_client_id(bob.id, key) is None
    await repo.add_message(theirs)

    assert await repo.find_by_client_id(ada.id, key) == mine
    assert await repo.find_by_client_id(bob.id, key) == theirs
    assert (await repo.page(room.id, None, 50)).messages == [theirs, mine]


async def test_tg654_the_database_rejects_the_same_key_of_the_same_author(
    repo: ChatRepository,
    sessions: async_sessionmaker[AsyncSession],
    engine: AsyncEngine,
) -> None:
    # The unique key (author_id, client_message_id) is the safety net itself.
    author = await _user(sessions)
    room = await _room_with(repo, sessions)
    key = uuid.uuid4()
    row = {
        "room_id": room.id,
        "author_id": author.id,
        "client_message_id": key,
        "sent_at": NOW,
    }
    async with engine.begin() as connection:
        await connection.execute(INSERT_KEYED_MESSAGE, {"id": uuid.uuid7(), **row})

    with pytest.raises(IntegrityError):
        async with engine.begin() as connection:
            await connection.execute(INSERT_KEYED_MESSAGE, {"id": uuid.uuid7(), **row})

    assert (
        await _count(engine, COUNT_KEYED, author_id=author.id, client_message_id=key)
        == 1
    )


async def test_tg654_adding_a_second_message_with_the_same_key_keeps_the_first(
    repo: ChatRepository,
    sessions: async_sessionmaker[AsyncSession],
    engine: AsyncEngine,
) -> None:
    # ON CONFLICT DO NOTHING: no error, and the stored one is the original.
    author = await _user(sessions)
    room = await _room_with(repo, sessions)
    key = uuid.uuid4()
    first = _message(room, author, NOW, "primer", key)
    second = _message(room, author, NOW + timedelta(seconds=1), "segon", key)

    assert await repo.add_message(first) == first
    # the loser gets the stored one back, not its own message
    assert await repo.add_message(second) == first

    assert await repo.find_by_client_id(author.id, key) == first
    assert (await repo.page(room.id, None, 50)).messages == [first]
    assert (
        await _count(engine, COUNT_KEYED, author_id=author.id, client_message_id=key)
        == 1
    )


async def test_tg654_concurrent_adds_of_the_same_key_store_a_single_message(
    repo: ChatRepository,
    sessions: async_sessionmaker[AsyncSession],
    engine: AsyncEngine,
) -> None:
    # The race of two retries of the same message: nobody fails, one row remains.
    author = await _user(sessions)
    room = await _room_with(repo, sessions)
    key = uuid.uuid4()
    attempts = [
        _message(room, author, NOW + timedelta(seconds=n), f"intent {n}", key)
        for n in range(10)
    ]

    results = await asyncio.gather(*(repo.add_message(a) for a in attempts))

    stored = await repo.find_by_client_id(author.id, key)
    assert stored in attempts
    assert results == [stored] * len(attempts)  # everyone gets the winner
    assert (await repo.page(room.id, None, 50)).messages == [stored]
    assert (
        await _count(engine, COUNT_KEYED, author_id=author.id, client_message_id=key)
        == 1
    )


async def test_tg654_a_repeated_message_id_is_still_a_primary_key_error(
    repo: ChatRepository, sessions: async_sessionmaker[AsyncSession]
) -> None:
    # The conflict target is (author_id, client_message_id) only: a repeated id
    # with another key must not be swallowed by ON CONFLICT DO NOTHING.
    room = await _room_with(repo, sessions)
    author = await _user(sessions)
    message = _message(room, author, NOW)
    await repo.add_message(message)
    other_key = message.model_copy(update={"client_message_id": uuid.uuid4()})

    with pytest.raises(IntegrityError, match="pk_chat_messages"):
        await repo.add_message(other_key)


# --- TG-64 / TG-469: nom de l'autora (users.display_name) per join ---------------


async def test_tg469_page_returns_the_author_name_from_the_profile(
    repo: ChatRepository, sessions: async_sessionmaker[AsyncSession]
) -> None:
    author = await _user(sessions, "Ada Lovelace")
    room = await _room_with(repo, sessions)
    await repo.add_message(_message(room, author, NOW, "hola"))

    page = await repo.page(room.id, None, 10)

    assert [m.author for m in page.messages] == [
        ChatAuthor(id=author.id, name="Ada Lovelace")
    ]


async def test_tg469_page_author_name_is_null_without_display_name(
    repo: ChatRepository, sessions: async_sessionmaker[AsyncSession]
) -> None:
    author = await _user(sessions, None)
    room = await _room_with(repo, sessions)
    await repo.add_message(_message(room, author, NOW, "hola"))

    page = await repo.page(room.id, None, 10)

    assert [m.author for m in page.messages] == [ChatAuthor(id=author.id, name=None)]


async def test_tg469_page_names_each_author_of_the_room(
    repo: ChatRepository, sessions: async_sessionmaker[AsyncSession]
) -> None:
    ada, bob = await _user(sessions, "Ada"), await _user(sessions, None)
    room = await _room_with(repo, sessions)
    await repo.add_message(_message(room, ada, NOW, "a"))
    await repo.add_message(_message(room, bob, NOW + timedelta(seconds=1), "b"))

    page = await repo.page(room.id, None, 10)

    assert [m.author for m in page.messages] == [
        ChatAuthor(id=bob.id, name=None),
        ChatAuthor(id=ada.id, name="Ada"),
    ]


async def test_tg469_the_author_name_follows_later_profile_changes(
    repo: ChatRepository,
    sessions: async_sessionmaker[AsyncSession],
    engine: AsyncEngine,
) -> None:
    # El nom no es copia al missatge: es llegeix del perfil en cada consulta
    author = await _user(sessions, "Ada")
    room = await _room_with(repo, sessions)
    await repo.add_message(_message(room, author, NOW, "hola"))
    async with engine.begin() as connection:
        await connection.execute(
            text("UPDATE users SET display_name = 'Ada B' WHERE id = :id"),
            {"id": author.id},
        )

    page = await repo.page(room.id, None, 10)

    assert page.messages[0].author == ChatAuthor(id=author.id, name="Ada B")


async def test_tg469_rooms_of_a_user_carry_the_name_of_the_last_author(
    repo: ChatRepository, sessions: async_sessionmaker[AsyncSession]
) -> None:
    me, other = await _user(sessions, "Ada"), await _user(sessions, "Bob")
    event = await _event(sessions)
    await _subscribe(sessions, me, event)
    room = await repo.get_or_create_room(event.id)
    await repo.add_message(_message(room, me, NOW, "primer"))
    await repo.add_message(_message(room, other, NOW + timedelta(seconds=1), "ultim"))

    [summary] = await repo.list_rooms_of(me.id)

    assert summary.last_message is not None
    assert summary.last_message.author == ChatAuthor(id=other.id, name="Bob")


async def test_tg469_rooms_last_message_author_name_is_null_without_display_name(
    repo: ChatRepository, sessions: async_sessionmaker[AsyncSession]
) -> None:
    me = await _user(sessions, None)
    event = await _event(sessions)
    await _subscribe(sessions, me, event)
    room = await repo.get_or_create_room(event.id)
    await repo.add_message(_message(room, me, NOW, "hola"))

    [summary] = await repo.list_rooms_of(me.id)

    assert summary.last_message is not None
    assert summary.last_message.author == ChatAuthor(id=me.id, name=None)


async def test_tg469_find_by_client_id_returns_the_author_name(
    repo: ChatRepository, sessions: async_sessionmaker[AsyncSession]
) -> None:
    author = await _user(sessions, "Ada")
    room = await _room_with(repo, sessions)
    key = uuid.uuid4()
    await repo.add_message(_message(room, author, NOW, "hola", key))

    found = await repo.find_by_client_id(author.id, key)

    assert found is not None
    assert found.author == ChatAuthor(id=author.id, name="Ada")


async def test_tg469_add_message_returns_the_message_with_its_author_name(
    repo: ChatRepository, sessions: async_sessionmaker[AsyncSession]
) -> None:
    author = await _user(sessions, "Ada")
    room = await _room_with(repo, sessions)
    key = uuid.uuid4()
    first = await repo.add_message(_message(room, author, NOW, "primer", key))

    # Un reintent concurrent retorna el desat, tambe amb el nom de l'autora
    retry = await repo.add_message(
        _message(room, author, NOW + timedelta(seconds=1), "primer", key)
    )

    assert first.author == ChatAuthor(id=author.id, name="Ada")
    assert retry.author == ChatAuthor(id=author.id, name="Ada")
