"""SQL repositories of the direct chat against PostgreSQL for real (TG-65, ADR-0023).

One conversation per pair of users (whatever the order), history by cursor, read
marks, summaries of the inbox in a single query, blocks and the user directory.

Real commits (the concurrent tests need them). Each test cleans only its own users
and what hangs from them, so the database is left as it was found.
"""

import asyncio
import os
import random
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.application.shared.error_codes import DATABASE_UNAVAILABLE
from app.application.shared.errors import ExternalServiceError
from app.domain.direct_chat.errors import CANNOT_MESSAGE_SELF, CONVERSATION_NOT_FOUND
from app.domain.direct_chat.models import (
    DirectConversation,
    DirectCursor,
    DirectMessage,
    UserBlock,
)
from app.domain.direct_chat.ports import (
    ChatUserDirectory,
    DirectConversationRepository,
    DirectMessageRepository,
    UserBlockRepository,
)
from app.domain.shared.errors import (
    BusinessRuleViolation,
    NotFoundError,
    ValidationError,
)
from app.domain.users.models import User
from app.infrastructure.direct_chat.repository import (
    SqlDirectConversationRepository,
    SqlDirectMessageRepository,
    SqlUserBlockRepository,
)
from app.infrastructure.direct_chat.tables import DirectMessageRow
from app.infrastructure.direct_chat.user_directory import SqlChatUserDirectory
from app.infrastructure.persistence.config import DatabaseSettings
from app.infrastructure.users.repository import SqlUserRepository

pytestmark = pytest.mark.skipif(
    not os.getenv("POSTGRES_HOST"),
    reason="PostgreSQL integration test requires POSTGRES_HOST",
)

NOW = datetime(2026, 11, 20, 21, 0, tzinfo=UTC)
PREFIX = "direct-repo"
# Explicit and in order: the keys are RESTRICT, nothing cascades.
DELETE_OWN_ROWS = (
    text(
        "DELETE FROM direct_messages WHERE sender_id IN"
        " (SELECT id FROM users WHERE email LIKE :prefix)"
    ),
    text(
        "DELETE FROM direct_conversations WHERE user_a_id IN"
        " (SELECT id FROM users WHERE email LIKE :prefix)"
        " OR user_b_id IN (SELECT id FROM users WHERE email LIKE :prefix)"
    ),
    text(
        "DELETE FROM user_blocks WHERE blocker_id IN"
        " (SELECT id FROM users WHERE email LIKE :prefix)"
        " OR blocked_id IN (SELECT id FROM users WHERE email LIKE :prefix)"
    ),
    text(
        "DELETE FROM user_identities WHERE user_id IN"
        " (SELECT id FROM users WHERE email LIKE :prefix)"
    ),
    text("DELETE FROM users WHERE email LIKE :prefix"),
)
COUNT_CONVERSATIONS_OF = text(
    "SELECT count(*) FROM direct_conversations"
    " WHERE user_a_id IN (:a, :b) AND user_b_id IN (:a, :b)"
)
COUNT_MESSAGES_OF = text(
    "SELECT count(*) FROM direct_messages WHERE sender_id = :sender"
)
COUNT_BLOCKS_OF = text("SELECT count(*) FROM user_blocks WHERE blocker_id = :blocker")
INSERT_CONVERSATION = text(
    "INSERT INTO direct_conversations (user_a_id, user_b_id, created_at)"
    " VALUES (:a, :b, now())"
)
INSERT_BLOCK = text(
    "INSERT INTO user_blocks (blocker_id, blocked_id, created_at)"
    " VALUES (:blocker, :blocked, now())"
)
INSERT_MESSAGE = text(
    "INSERT INTO direct_messages"
    " (conversation_id, sender_id, text, client_message_id)"
    " VALUES (:conversation, :sender, :body, gen_random_uuid())"
)


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


@pytest.fixture
def conversations(
    sessions: async_sessionmaker[AsyncSession],
) -> DirectConversationRepository:
    repository: DirectConversationRepository = SqlDirectConversationRepository(sessions)
    return repository


@pytest.fixture
def messages(sessions: async_sessionmaker[AsyncSession]) -> DirectMessageRepository:
    repository: DirectMessageRepository = SqlDirectMessageRepository(sessions)
    return repository


@pytest.fixture
def blocks(sessions: async_sessionmaker[AsyncSession]) -> UserBlockRepository:
    repository: UserBlockRepository = SqlUserBlockRepository(sessions)
    return repository


@pytest.fixture
def directory(sessions: async_sessionmaker[AsyncSession]) -> ChatUserDirectory:
    adapter: ChatUserDirectory = SqlChatUserDirectory(sessions)
    return adapter


async def _user(sessions: async_sessionmaker[AsyncSession]) -> User:
    unique = f"{PREFIX}-{uuid.uuid4().hex}"
    return await SqlUserRepository(sessions).add(
        User.create(
            google_sub=f"sub-{unique}",
            email=f"{unique}@example.test",
            display_name="Ada",
        )
    )


async def _users(sessions: async_sessionmaker[AsyncSession], count: int) -> list[User]:
    return [await _user(sessions) for _ in range(count)]


async def _pair(sessions: async_sessionmaker[AsyncSession]) -> tuple[User, User]:
    return await _user(sessions), await _user(sessions)


def _message(
    conversation: DirectConversation,
    sender: uuid.UUID,
    sent_at: datetime,
    body: str = "Hola",
    client_message_id: uuid.UUID | None = None,
) -> DirectMessage:
    return DirectMessage(
        id=uuid.uuid7(),
        conversation_id=conversation.id,
        sender_id=sender,
        text=body,
        sent_at=sent_at,
        client_message_id=client_message_id or uuid.uuid4(),
    )


async def _count(engine: AsyncEngine, statement: Any, **params: uuid.UUID) -> int:
    async with engine.connect() as connection:
        return int(await connection.scalar(statement, params) or 0)


async def _execute(engine: AsyncEngine, statement: Any, **params: object) -> None:
    async with engine.begin() as connection:
        await connection.execute(statement, params)


async def _conversation_with_history(
    conversations: DirectConversationRepository,
    messages: DirectMessageRepository,
    sessions: async_sessionmaker[AsyncSession],
    count: int,
    tie: int = 1,
) -> tuple[DirectConversation, list[DirectMessage]]:
    """A conversation and ``count`` messages stored out of order (``tie`` per time)."""
    one, other = await _pair(sessions)
    conversation, _ = await conversations.get_or_create(one.id, other.id)
    history = [
        _message(
            conversation,
            (one.id, other.id)[index % 2],
            NOW + timedelta(seconds=index // tie),
            f"m{index}",
        )
        for index in range(count)
    ]
    # Direct inserts preserve timestamp ties to exercise the keyset cursor even
    # though normal repository writes assign strictly increasing timestamps.
    async with sessions() as session:
        for message in random.Random(65).sample(history, k=len(history)):
            session.add(DirectMessageRow(**message.model_dump()))
        await session.commit()
    return conversation, history


# --- get_or_create: one conversation per pair ----------------------------------


async def test_tg65_c1_the_pair_has_the_same_conversation_in_any_order(
    conversations: DirectConversationRepository,
    sessions: async_sessionmaker[AsyncSession],
    engine: AsyncEngine,
) -> None:
    ada, grace = await _pair(sessions)

    first, first_created = await conversations.get_or_create(ada.id, grace.id)
    second, second_created = await conversations.get_or_create(grace.id, ada.id)

    assert (first_created, second_created) == (True, False)
    assert first == second
    assert (first.user_a_id, first.user_b_id) == tuple(sorted((ada.id, grace.id)))
    assert first.user_a_read_at is None and first.user_b_read_at is None
    assert await _count(engine, COUNT_CONVERSATIONS_OF, a=ada.id, b=grace.id) == 1


async def test_tg65_c1_crossed_concurrent_requests_end_up_with_a_single_conversation(
    conversations: DirectConversationRepository,
    sessions: async_sessionmaker[AsyncSession],
    engine: AsyncEngine,
) -> None:
    ada, grace = await _pair(sessions)

    results = await asyncio.gather(
        *(
            conversations.get_or_create(
                *((ada.id, grace.id), (grace.id, ada.id))[i % 2]
            )
            for i in range(10)
        )
    )

    assert len({conversation.id for conversation, _ in results}) == 1
    assert sum(created for _, created in results) == 1
    assert await _count(engine, COUNT_CONVERSATIONS_OF, a=ada.id, b=grace.id) == 1


async def test_tg65_c1_a_user_cannot_open_a_conversation_with_themselves(
    conversations: DirectConversationRepository,
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    ada = await _user(sessions)

    with pytest.raises(BusinessRuleViolation) as error:
        await conversations.get_or_create(ada.id, ada.id)

    assert error.value.code == CANNOT_MESSAGE_SELF


async def test_tg65_c1_get_returns_the_stored_conversation_or_none(
    conversations: DirectConversationRepository,
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    ada, grace = await _pair(sessions)
    stored, _ = await conversations.get_or_create(ada.id, grace.id)

    assert await conversations.get(stored.id) == stored
    assert await conversations.get(uuid.uuid7()) is None


async def test_tg65_c1_list_of_returns_only_the_conversations_of_the_user(
    conversations: DirectConversationRepository,
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    me, one, two, stranger = await _users(sessions, 4)
    # Both orders: the user may be the first or the second of the stored pair.
    with_one, _ = await conversations.get_or_create(me.id, one.id)
    with_two, _ = await conversations.get_or_create(two.id, me.id)
    await conversations.get_or_create(one.id, stranger.id)

    assert sorted(await conversations.list_of(me.id), key=lambda c: c.id) == sorted(
        [with_one, with_two], key=lambda c: c.id
    )
    assert await conversations.list_of(uuid.uuid7()) == []


# --- constraints of the database (defence in depth) ----------------------------


async def test_tg65_c2_the_database_rejects_an_unordered_pair(
    sessions: async_sessionmaker[AsyncSession], engine: AsyncEngine
) -> None:
    ada, grace = await _pair(sessions)
    low, high = sorted((ada.id, grace.id))

    with pytest.raises(IntegrityError, match="ck_direct_conversations_pair_ordered"):
        await _execute(engine, INSERT_CONVERSATION, a=high, b=low)


async def test_tg65_c2_the_database_rejects_a_conversation_with_oneself(
    sessions: async_sessionmaker[AsyncSession], engine: AsyncEngine
) -> None:
    ada = await _user(sessions)

    with pytest.raises(IntegrityError, match="ck_direct_conversations_pair_ordered"):
        await _execute(engine, INSERT_CONVERSATION, a=ada.id, b=ada.id)


async def test_tg65_c2_the_database_rejects_a_second_conversation_of_the_pair(
    sessions: async_sessionmaker[AsyncSession], engine: AsyncEngine
) -> None:
    ada, grace = await _pair(sessions)
    low, high = sorted((ada.id, grace.id))
    await _execute(engine, INSERT_CONVERSATION, a=low, b=high)

    with pytest.raises(IntegrityError, match="uq_direct_conversations_pair"):
        await _execute(engine, INSERT_CONVERSATION, a=low, b=high)


async def test_tg65_c2_a_conversation_needs_two_existing_users(
    sessions: async_sessionmaker[AsyncSession], engine: AsyncEngine
) -> None:
    ada = await _user(sessions)
    ghost = uuid.UUID(int=2**128 - 1)  # sorts after any uuid7 of the test

    with pytest.raises(IntegrityError, match="foreign key"):
        await _execute(engine, INSERT_CONVERSATION, a=ada.id, b=ghost)


async def test_tg65_c2_the_database_rejects_an_empty_message(
    conversations: DirectConversationRepository,
    sessions: async_sessionmaker[AsyncSession],
    engine: AsyncEngine,
) -> None:
    ada, grace = await _pair(sessions)
    conversation, _ = await conversations.get_or_create(ada.id, grace.id)

    with pytest.raises(IntegrityError, match="ck_direct_messages_text_not_empty"):
        await _execute(
            engine,
            INSERT_MESSAGE,
            conversation=conversation.id,
            sender=ada.id,
            body="",
        )


async def test_tg65_c2_the_database_rejects_a_message_longer_than_the_limit(
    conversations: DirectConversationRepository,
    sessions: async_sessionmaker[AsyncSession],
    engine: AsyncEngine,
) -> None:
    ada, grace = await _pair(sessions)
    conversation, _ = await conversations.get_or_create(ada.id, grace.id)

    with pytest.raises(DBAPIError):
        await _execute(
            engine,
            INSERT_MESSAGE,
            conversation=conversation.id,
            sender=ada.id,
            body="x" * 1001,
        )


async def test_tg65_c2_the_database_rejects_a_message_of_a_missing_conversation(
    sessions: async_sessionmaker[AsyncSession], engine: AsyncEngine
) -> None:
    ada = await _user(sessions)

    with pytest.raises(IntegrityError, match="foreign key"):
        await _execute(
            engine,
            INSERT_MESSAGE,
            conversation=uuid.uuid7(),
            sender=ada.id,
            body="Hola",
        )


async def test_tg65_c2_the_database_rejects_blocking_oneself_or_a_missing_user(
    sessions: async_sessionmaker[AsyncSession], engine: AsyncEngine
) -> None:
    ada = await _user(sessions)

    with pytest.raises(IntegrityError, match="ck_user_blocks_not_self"):
        await _execute(engine, INSERT_BLOCK, blocker=ada.id, blocked=ada.id)
    with pytest.raises(IntegrityError, match="foreign key"):
        await _execute(engine, INSERT_BLOCK, blocker=ada.id, blocked=uuid.uuid7())


# --- messages: history, idempotency, unread ------------------------------------


async def test_tg65_c3_an_added_message_is_persisted_and_readable(
    conversations: DirectConversationRepository,
    messages: DirectMessageRepository,
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    ada, grace = await _pair(sessions)
    conversation, _ = await conversations.get_or_create(ada.id, grace.id)
    message = _message(conversation, ada.id, NOW, "Quin cel més net")

    stored = await messages.add(message)

    assert stored == message
    page = await messages.page(conversation.id, None, 50)
    assert page.messages == [message]
    assert page.next_cursor is None


async def test_tg65_c3_history_is_newest_first_by_cursor_without_gaps_or_repeats(
    conversations: DirectConversationRepository,
    messages: DirectMessageRepository,
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    # Three messages share each timestamp: ties are broken by id.
    conversation, history = await _conversation_with_history(
        conversations, messages, sessions, count=120, tie=3
    )
    expected = sorted(history, key=lambda m: (m.sent_at, m.id), reverse=True)

    pages = []
    cursor: DirectCursor | None = None
    while True:
        page = await messages.page(conversation.id, cursor, 50)
        pages.append(page)
        if page.next_cursor is None:
            break
        cursor = page.next_cursor

    assert [len(page.messages) for page in pages] == [50, 50, 20]
    assert [m for page in pages for m in page.messages] == expected
    assert pages[0].next_cursor == DirectCursor(
        sent_at=expected[49].sent_at, id=expected[49].id
    )
    assert pages[-1].next_cursor is None


async def test_tg65_c3_the_cursor_is_exclusive(
    conversations: DirectConversationRepository,
    messages: DirectMessageRepository,
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    conversation, history = await _conversation_with_history(
        conversations, messages, sessions, count=3
    )
    oldest, middle, newest = history

    page = await messages.page(
        conversation.id, DirectCursor(sent_at=middle.sent_at, id=middle.id), 50
    )

    assert page.messages == [oldest]
    assert newest not in page.messages


async def test_tg65_c3_a_page_ends_at_the_limit_and_only_then_has_a_next_cursor(
    conversations: DirectConversationRepository,
    messages: DirectMessageRepository,
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    exact, _ = await _conversation_with_history(
        conversations, messages, sessions, count=5
    )
    more, history = await _conversation_with_history(
        conversations, messages, sessions, count=6
    )

    assert (await messages.page(exact.id, None, 5)).next_cursor is None
    page = await messages.page(more.id, None, 5)
    assert len(page.messages) == 5
    assert page.next_cursor == DirectCursor(
        sent_at=page.messages[-1].sent_at, id=page.messages[-1].id
    )
    assert history[0] not in page.messages


async def test_tg65_c3_history_only_has_the_messages_of_its_conversation(
    conversations: DirectConversationRepository,
    messages: DirectMessageRepository,
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    ada, grace, linus = await _users(sessions, 3)
    mine, _ = await conversations.get_or_create(ada.id, grace.id)
    other, _ = await conversations.get_or_create(ada.id, linus.id)
    mine_message = _message(mine, ada.id, NOW)
    await messages.add(mine_message)
    await messages.add(_message(other, ada.id, NOW + timedelta(seconds=1)))

    assert (await messages.page(mine.id, None, 50)).messages == [mine_message]
    assert (await messages.page(uuid.uuid7(), None, 50)).messages == []


async def test_tg65_c4_a_retry_with_the_same_client_id_stores_one_message(
    conversations: DirectConversationRepository,
    messages: DirectMessageRepository,
    sessions: async_sessionmaker[AsyncSession],
    engine: AsyncEngine,
) -> None:
    ada, grace = await _pair(sessions)
    conversation, _ = await conversations.get_or_create(ada.id, grace.id)
    client_id = uuid.uuid4()
    first = _message(conversation, ada.id, NOW, "Hola", client_id)
    retry = _message(
        conversation, ada.id, NOW + timedelta(seconds=5), "Hola", client_id
    )

    stored_first = await messages.add(first)
    stored_retry = await messages.add(retry)

    assert stored_first == first
    assert stored_retry == first
    assert await _count(engine, COUNT_MESSAGES_OF, sender=ada.id) == 1


async def test_tg65_c4_concurrent_retries_end_up_with_a_single_message(
    conversations: DirectConversationRepository,
    messages: DirectMessageRepository,
    sessions: async_sessionmaker[AsyncSession],
    engine: AsyncEngine,
) -> None:
    ada, grace = await _pair(sessions)
    conversation, _ = await conversations.get_or_create(ada.id, grace.id)
    client_id = uuid.uuid4()

    stored = await asyncio.gather(
        *(
            messages.add(
                _message(
                    conversation, ada.id, NOW + timedelta(seconds=i), "Hola", client_id
                )
            )
            for i in range(8)
        )
    )

    assert len({message.id for message in stored}) == 1
    assert await _count(engine, COUNT_MESSAGES_OF, sender=ada.id) == 1


async def test_tg65_c4_the_client_id_is_unique_per_sender_not_global(
    conversations: DirectConversationRepository,
    messages: DirectMessageRepository,
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    ada, grace = await _pair(sessions)
    conversation, _ = await conversations.get_or_create(ada.id, grace.id)
    client_id = uuid.uuid4()
    from_ada = _message(conversation, ada.id, NOW, "d'Ada", client_id)
    from_grace = _message(conversation, grace.id, NOW, "de Grace", client_id)

    assert await messages.add(from_ada) == from_ada
    stored_grace = await messages.add(from_grace)
    assert stored_grace.id == from_grace.id
    assert stored_grace.sent_at > from_ada.sent_at
    assert await messages.find_by_client_id(ada.id, client_id) == from_ada
    assert await messages.find_by_client_id(grace.id, client_id) == stored_grace


async def test_tg65_c4_find_by_client_id_is_none_when_the_sender_never_sent_it(
    messages: DirectMessageRepository,
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    ada = await _user(sessions)

    assert await messages.find_by_client_id(ada.id, uuid.uuid4()) is None


async def test_tg65_c5_unread_counts_only_the_other_participant_after_since(
    conversations: DirectConversationRepository,
    messages: DirectMessageRepository,
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    ada, grace = await _pair(sessions)
    conversation, _ = await conversations.get_or_create(ada.id, grace.id)
    # Grace writes at +1, +3 and +5 minutes; Ada at +2 and +4.
    for minutes, sender in ((1, grace), (2, ada), (3, grace), (4, ada), (5, grace)):
        await messages.add(
            _message(conversation, sender.id, NOW + timedelta(minutes=minutes))
        )

    def unread(user: User, since: datetime | None) -> Awaitable[int]:
        return messages.count_unread(conversation.id, user.id, since)

    assert await unread(ada, None) == 3
    assert await unread(grace, None) == 2
    assert await unread(ada, NOW) == 3
    assert await unread(ada, NOW + timedelta(minutes=2)) == 2
    # Strictly after: a message sent at the read mark is already read.
    assert await unread(ada, NOW + timedelta(minutes=3)) == 1
    assert await unread(ada, NOW + timedelta(minutes=5)) == 0
    assert await unread(grace, NOW + timedelta(minutes=3)) == 1


# --- mark_read -----------------------------------------------------------------


async def test_tg65_c6_the_read_mark_is_persisted_for_each_participant(
    conversations: DirectConversationRepository,
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    ada, grace = await _pair(sessions)
    stored, _ = await conversations.get_or_create(ada.id, grace.id)

    first = await conversations.mark_read(stored.id, stored.user_a_id, NOW)
    both = await conversations.mark_read(
        stored.id, stored.user_b_id, NOW + timedelta(minutes=1)
    )

    assert first.user_a_read_at == NOW and first.user_b_read_at is None
    assert both.user_a_read_at == NOW
    assert both.user_b_read_at == NOW + timedelta(minutes=1)
    assert await conversations.get(stored.id) == both


async def test_tg65_c6_the_read_mark_never_goes_backwards(
    conversations: DirectConversationRepository,
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    ada, grace = await _pair(sessions)
    stored, _ = await conversations.get_or_create(ada.id, grace.id)
    await conversations.mark_read(stored.id, stored.user_a_id, NOW)

    earlier = await conversations.mark_read(
        stored.id, stored.user_a_id, NOW - timedelta(hours=1)
    )
    same = await conversations.mark_read(stored.id, stored.user_a_id, NOW)

    assert earlier.user_a_read_at == NOW
    assert same.user_a_read_at == NOW
    assert (await conversations.get(stored.id)) == earlier


async def test_tg65_c6_concurrent_marks_keep_the_latest(
    conversations: DirectConversationRepository,
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    ada, grace = await _pair(sessions)
    stored, _ = await conversations.get_or_create(ada.id, grace.id)
    moments = [NOW + timedelta(minutes=minute) for minute in range(8)]
    random.Random(65).shuffle(moments)

    await asyncio.gather(
        *(conversations.mark_read(stored.id, stored.user_b_id, at) for at in moments)
    )

    final = await conversations.get(stored.id)
    assert final is not None
    assert final.user_b_read_at == NOW + timedelta(minutes=7)


async def test_tg65_c6_a_naive_time_is_rejected_and_nothing_is_stored(
    conversations: DirectConversationRepository,
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    ada, grace = await _pair(sessions)
    stored, _ = await conversations.get_or_create(ada.id, grace.id)

    with pytest.raises(ValidationError):
        await conversations.mark_read(
            stored.id, stored.user_a_id, datetime(2026, 11, 20, 21, 0)
        )

    assert await conversations.get(stored.id) == stored


async def test_tg65_c6_a_stranger_or_a_missing_conversation_is_not_found(
    conversations: DirectConversationRepository,
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    ada, grace = await _pair(sessions)
    stranger = await _user(sessions)
    stored, _ = await conversations.get_or_create(ada.id, grace.id)

    with pytest.raises(NotFoundError) as of_stranger:
        await conversations.mark_read(stored.id, stranger.id, NOW)
    with pytest.raises(NotFoundError) as of_missing:
        await conversations.mark_read(uuid.uuid7(), ada.id, NOW)

    assert of_stranger.value.code == CONVERSATION_NOT_FOUND
    assert of_missing.value.code == CONVERSATION_NOT_FOUND
    assert await conversations.get(stored.id) == stored


# --- summaries_of: the inbox in one query --------------------------------------


async def test_tg65_c7_summaries_are_by_last_message_with_preview_and_unread(
    conversations: DirectConversationRepository,
    messages: DirectMessageRepository,
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    me, old, recent, middle = await _users(sessions, 4)
    # Both orders: I am the first of the stored pair in some and the second in others.
    with_old, _ = await conversations.get_or_create(me.id, old.id)
    with_recent, _ = await conversations.get_or_create(recent.id, me.id)
    with_middle, _ = await conversations.get_or_create(me.id, middle.id)
    last_of_old = _message(with_old, old.id, NOW, "Hola?")
    last_of_recent = _message(with_recent, me.id, NOW + timedelta(hours=2), "Fet")
    last_of_middle = _message(with_middle, middle.id, NOW + timedelta(hours=1), "Ei")
    for message in (last_of_old, last_of_recent, last_of_middle):
        await messages.add(message)

    summaries = await conversations.summaries_of(me.id)

    assert [s.conversation.id for s in summaries] == [
        with_recent.id,
        with_middle.id,
        with_old.id,
    ]
    assert [s.last_message for s in summaries] == [
        last_of_recent,
        last_of_middle,
        last_of_old,
    ]
    assert [s.conversation for s in summaries] == [
        with_recent,
        with_middle,
        with_old,
    ]


async def test_tg65_c7_unread_counts_only_messages_of_the_other_after_my_mark(
    conversations: DirectConversationRepository,
    messages: DirectMessageRepository,
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    me, other = await _pair(sessions)
    quiet, silent = await _user(sessions), await _user(sessions)
    conversation, _ = await conversations.get_or_create(me.id, other.id)
    # 3 from the other (+1, +3, +5 min), 2 from me (+2, +4 min).
    for minutes, sender in ((1, other), (2, me), (3, other), (4, me), (5, other)):
        await messages.add(
            _message(conversation, sender.id, NOW + timedelta(minutes=minutes))
        )
    # A conversation where I wrote last: nothing unread; and an empty one.
    mine_only, _ = await conversations.get_or_create(me.id, quiet.id)
    await messages.add(_message(mine_only, me.id, NOW + timedelta(minutes=9)))
    await conversations.get_or_create(me.id, silent.id)

    async def unread_by_conversation() -> dict[uuid.UUID, int]:
        return {
            s.conversation.id: s.unread_count
            for s in await conversations.summaries_of(me.id)
        }

    before = await unread_by_conversation()
    await conversations.mark_read(conversation.id, me.id, NOW + timedelta(minutes=3))
    after_mark = await unread_by_conversation()
    await conversations.mark_read(conversation.id, me.id, NOW + timedelta(minutes=5))
    after_all = await unread_by_conversation()

    assert before[conversation.id] == 3
    assert after_mark[conversation.id] == 1  # only the one at +5, not the one at +3
    assert after_all[conversation.id] == 0
    assert before[mine_only.id] == 0
    assert len(before) == 3


async def test_tg65_c7_a_conversation_without_messages_has_no_last_message(
    conversations: DirectConversationRepository,
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    me, other = await _pair(sessions)
    empty, _ = await conversations.get_or_create(me.id, other.id)

    [summary] = await conversations.summaries_of(me.id)

    assert summary.conversation == empty
    assert summary.last_message is None
    assert summary.unread_count == 0


async def test_tg65_c7_conversations_without_messages_are_newest_first_by_creation(
    conversations: DirectConversationRepository,
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    me, one, two, three = await _users(sessions, 4)
    first, _ = await conversations.get_or_create(me.id, one.id)
    second, _ = await conversations.get_or_create(me.id, two.id)
    third, _ = await conversations.get_or_create(me.id, three.id)

    summaries = await conversations.summaries_of(me.id)

    assert [s.conversation.id for s in summaries] == [third.id, second.id, first.id]


async def test_tg65_c7_summaries_only_have_the_conversations_of_the_user(
    conversations: DirectConversationRepository,
    messages: DirectMessageRepository,
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    me, other, stranger = await _users(sessions, 3)
    mine, _ = await conversations.get_or_create(me.id, other.id)
    theirs, _ = await conversations.get_or_create(other.id, stranger.id)
    await messages.add(_message(theirs, stranger.id, NOW))

    assert [s.conversation.id for s in await conversations.summaries_of(me.id)] == [
        mine.id
    ]
    assert await conversations.summaries_of(uuid.uuid7()) == []


@pytest.mark.parametrize("count", [1, 5, 20])
async def test_tg65_c7_summaries_take_the_same_statements_whatever_the_count(
    count: int,
    conversations: DirectConversationRepository,
    messages: DirectMessageRepository,
    sessions: async_sessionmaker[AsyncSession],
    captured_sql: list[tuple[str, Any]],
) -> None:
    # No N+1: with 1, 5 or 20 conversations (each with history) the inbox is one query.
    me = await _user(sessions)
    for _ in range(count):
        other = await _user(sessions)
        conversation, _ = await conversations.get_or_create(me.id, other.id)
        for minutes, sender in ((1, other), (2, me), (3, other)):
            await messages.add(
                _message(conversation, sender.id, NOW + timedelta(minutes=minutes))
            )
    captured_sql.clear()

    summaries = await conversations.summaries_of(me.id)

    assert len(summaries) == count
    assert all(s.unread_count == 2 and s.last_message for s in summaries)
    assert len(captured_sql) == 1


# --- blocks --------------------------------------------------------------------


async def test_tg65_c8_a_block_is_persisted_and_is_directional(
    blocks: UserBlockRepository, sessions: async_sessionmaker[AsyncSession]
) -> None:
    ada, grace = await _pair(sessions)
    assert not await blocks.is_blocked(ada.id, grace.id)

    await blocks.block(UserBlock.create(ada.id, grace.id))

    assert await blocks.is_blocked(ada.id, grace.id)
    assert not await blocks.is_blocked(grace.id, ada.id)


async def test_tg65_c8_blocking_twice_changes_nothing(
    blocks: UserBlockRepository,
    sessions: async_sessionmaker[AsyncSession],
    engine: AsyncEngine,
) -> None:
    ada, grace = await _pair(sessions)

    await blocks.block(UserBlock.create(ada.id, grace.id))
    await blocks.block(UserBlock.create(ada.id, grace.id))

    assert await blocks.is_blocked(ada.id, grace.id)
    assert await _count(engine, COUNT_BLOCKS_OF, blocker=ada.id) == 1


async def test_tg65_c8_unblock_removes_the_block_and_is_idempotent(
    blocks: UserBlockRepository, sessions: async_sessionmaker[AsyncSession]
) -> None:
    ada, grace = await _pair(sessions)
    await blocks.block(UserBlock.create(ada.id, grace.id))
    await blocks.block(UserBlock.create(grace.id, ada.id))

    await blocks.unblock(ada.id, grace.id)
    await blocks.unblock(ada.id, grace.id)
    await blocks.unblock(ada.id, uuid.uuid7())

    assert not await blocks.is_blocked(ada.id, grace.id)
    # The block in the other direction is another one and stays.
    assert await blocks.is_blocked(grace.id, ada.id)


async def test_tg65_c8_blocked_among_returns_who_the_blocker_blocks(
    blocks: UserBlockRepository, sessions: async_sessionmaker[AsyncSession]
) -> None:
    me, one, two, free, blocker = await _users(sessions, 5)
    await blocks.block(UserBlock.create(me.id, one.id))
    await blocks.block(UserBlock.create(me.id, two.id))
    # Directional: those who block me, or whom somebody else blocks, are not mine.
    await blocks.block(UserBlock.create(free.id, me.id))
    await blocks.block(UserBlock.create(blocker.id, free.id))

    assert await blocks.blocked_among(me.id, [one.id, two.id, free.id]) == {
        one.id,
        two.id,
    }
    assert await blocks.blocked_among(me.id, [free.id]) == set()
    assert await blocks.blocked_among(me.id, [one.id, uuid.uuid7()]) == {one.id}
    assert await blocks.blocked_among(me.id, []) == set()


# --- user directory ------------------------------------------------------------


async def test_tg65_c9_a_live_user_exists_and_an_unknown_one_does_not(
    directory: ChatUserDirectory, sessions: async_sessionmaker[AsyncSession]
) -> None:
    ada = await _user(sessions)

    assert await directory.exists(ada.id) is True
    assert await directory.exists(uuid.uuid7()) is False


async def test_tg65_c9_a_deleted_user_does_not_exist_for_the_chat(
    directory: ChatUserDirectory,
    sessions: async_sessionmaker[AsyncSession],
    engine: AsyncEngine,
) -> None:
    ada = await _user(sessions)
    await _execute(
        engine, text("UPDATE users SET deleted_at = now() WHERE id = :id"), id=ada.id
    )

    assert await directory.exists(ada.id) is False


# --- database errors -----------------------------------------------------------


@pytest.mark.parametrize(
    "call",
    [
        pytest.param(lambda r, u, m: r.get_or_create(u, m), id="get_or_create"),
        pytest.param(lambda r, u, m: r.get(u), id="get"),
        pytest.param(lambda r, u, m: r.mark_read(u, m, NOW), id="mark_read"),
        pytest.param(lambda r, u, m: r.list_of(u), id="list_of"),
        pytest.param(lambda r, u, m: r.summaries_of(u), id="summaries_of"),
    ],
)
async def test_tg65_c10_conversation_repository_maps_an_unreachable_database(
    call: Callable[[Any, uuid.UUID, uuid.UUID], Awaitable[object]],
) -> None:
    dead = create_async_engine("postgresql+asyncpg://u:p@127.0.0.1:1/none")
    try:
        repository = SqlDirectConversationRepository(
            async_sessionmaker(dead, expire_on_commit=False)
        )
        with pytest.raises(ExternalServiceError) as error:
            await call(repository, uuid.uuid7(), uuid.uuid7())
    finally:
        await dead.dispose()

    assert error.value.code == DATABASE_UNAVAILABLE


async def test_tg65_c10_the_other_adapters_map_an_unreachable_database() -> None:
    dead = create_async_engine("postgresql+asyncpg://u:p@127.0.0.1:1/none")
    factory = async_sessionmaker(dead, expire_on_commit=False)
    one, two = uuid.uuid7(), uuid.uuid7()
    stored = DirectMessage(
        id=uuid.uuid7(),
        conversation_id=uuid.uuid7(),
        sender_id=one,
        text="Hola",
        sent_at=NOW,
        client_message_id=uuid.uuid4(),
    )
    calls: list[Awaitable[object]] = [
        SqlDirectMessageRepository(factory).add(stored),
        SqlDirectMessageRepository(factory).find_by_client_id(one, uuid.uuid4()),
        SqlDirectMessageRepository(factory).page(uuid.uuid7(), None, 10),
        SqlDirectMessageRepository(factory).count_unread(uuid.uuid7(), one, None),
        SqlUserBlockRepository(factory).block(UserBlock.create(one, two)),
        SqlUserBlockRepository(factory).unblock(one, two),
        SqlUserBlockRepository(factory).is_blocked(one, two),
        SqlUserBlockRepository(factory).blocked_among(one, [two]),
        SqlChatUserDirectory(factory).exists(one),
    ]
    try:
        for call in calls:
            with pytest.raises(ExternalServiceError) as error:
                await call
            assert error.value.code == DATABASE_UNAVAILABLE
    finally:
        await dead.dispose()


async def test_tg65_message_commit_order_survives_clock_skew(
    conversations: DirectConversationRepository,
    messages: DirectMessageRepository,
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    ada, grace = await _pair(sessions)
    conversation, _ = await conversations.get_or_create(ada.id, grace.id)
    first = await messages.add(
        _message(conversation, ada.id, NOW + timedelta(hours=1), "first")
    )
    second = await messages.add(_message(conversation, grace.id, NOW, "second"))
    assert second.sent_at > first.sent_at
