"""SqlChatRepository error mapping and guards with a fake session (TG-448,
ADR-0018): a database failure is an ExternalServiceError, never a raw exception.
"""

import uuid
from datetime import UTC, datetime
from typing import Any, cast

import pytest
from sqlalchemy.exc import IntegrityError, InterfaceError, OperationalError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.application.shared.error_codes import DATABASE_UNAVAILABLE
from app.application.shared.errors import ExternalServiceError
from app.domain.chat.models import ChatAuthor, ChatMessage
from app.domain.events.errors import EVENT_NOT_FOUND
from app.domain.shared.errors import NotFoundError
from app.infrastructure.chat.repository import SqlChatRepository
from app.infrastructure.chat.tables import ChatMessageRow

DB_FAILURES = [
    pytest.param(OperationalError("SELECT 1", {}, Exception("down")), id="operational"),
    pytest.param(InterfaceError("SELECT 1", {}, Exception("closed")), id="interface"),
    pytest.param(OSError("connection refused"), id="os"),
]


class FakeSession:
    """Every call succeeds unless it is in ``failures``, a map from method name
    to the exception it raises. A list value is consumed one entry per call
    (``None`` means that call succeeds)."""

    def __init__(self, failures: dict[str, Any] | None = None) -> None:
        self.failures = failures or {}
        self.calls: list[str] = []

    async def __aenter__(self) -> FakeSession:
        return self

    async def __aexit__(self, *exc_info: object) -> None:
        return None

    def _go(self, name: str) -> None:
        self.calls.append(name)
        failure = self.failures.get(name)
        if isinstance(failure, list):
            failure = failure.pop(0) if failure else None
        if failure is not None:
            raise failure

    async def scalar(self, *_: object) -> Any:
        self._go("scalar")
        return True

    async def scalars(self, *_: object) -> Any:
        self._go("scalars")
        raise AssertionError("scalars must be configured to fail")

    async def execute(self, *_: object) -> Any:
        self._go("execute")

    async def commit(self) -> None:
        self._go("commit")

    async def rollback(self) -> None:
        self._go("rollback")


def _repository(session: FakeSession) -> SqlChatRepository:
    return SqlChatRepository(cast(async_sessionmaker[AsyncSession], lambda: session))


def _message() -> ChatMessage:
    return ChatMessage(
        id=uuid.uuid7(),
        room_id=uuid.uuid7(),
        author=ChatAuthor(id=uuid.uuid7(), name=None),
        client_message_id=uuid.uuid4(),
        text="Hola",
        sent_at=datetime(2026, 11, 17, 21, 0, tzinfo=UTC),
    )


@pytest.mark.parametrize("failure", DB_FAILURES)
async def test_tg448_require_event_maps_a_database_failure(
    failure: Exception,
) -> None:
    repository = _repository(FakeSession({"scalar": failure}))

    with pytest.raises(ExternalServiceError) as error:
        await repository.require_event(uuid.uuid7())

    assert error.value.code == DATABASE_UNAVAILABLE


@pytest.mark.parametrize("failure", DB_FAILURES)
async def test_tg448_get_or_create_room_maps_a_database_failure_on_the_check(
    failure: Exception,
) -> None:
    repository = _repository(FakeSession({"scalar": failure}))

    with pytest.raises(ExternalServiceError) as error:
        await repository.get_or_create_room(uuid.uuid7())

    assert error.value.code == DATABASE_UNAVAILABLE


@pytest.mark.parametrize("failure", DB_FAILURES)
async def test_tg448_get_or_create_room_maps_a_database_failure_on_the_insert(
    failure: Exception,
) -> None:
    # The existence check succeeds, the insert fails.
    repository = _repository(FakeSession({"scalar": [None, failure]}))

    with pytest.raises(ExternalServiceError) as error:
        await repository.get_or_create_room(uuid.uuid7())

    assert error.value.code == DATABASE_UNAVAILABLE


async def test_tg448_get_or_create_room_of_an_event_deleted_meanwhile() -> None:
    session = FakeSession(
        {"scalar": [None, IntegrityError("INSERT", {}, Exception("fk"))]}
    )

    with pytest.raises(NotFoundError) as error:
        await _repository(session).get_or_create_room(uuid.uuid7())

    assert error.value.code == EVENT_NOT_FOUND
    assert "rollback" in session.calls


@pytest.mark.parametrize("failure", DB_FAILURES)
@pytest.mark.parametrize("method", ["execute", "commit"])
async def test_tg448_add_message_maps_a_database_failure(
    failure: Exception, method: str
) -> None:
    repository = _repository(FakeSession({method: failure}))

    with pytest.raises(ExternalServiceError) as error:
        await repository.add_message(_message())

    assert error.value.code == DATABASE_UNAVAILABLE


ROOM_FK = (
    'insert or update on table "chat_messages" violates foreign key constraint '
    '"fk_chat_messages_room_id_event_chat_rooms"'
)


async def test_tg448_add_message_with_a_missing_room_is_not_found() -> None:
    repository = _repository(
        FakeSession({"execute": IntegrityError("INSERT", {}, Exception(ROOM_FK))})
    )

    with pytest.raises(NotFoundError) as error:
        await repository.add_message(_message())

    assert error.value.code == "CHAT_ROOM_NOT_FOUND"


@pytest.mark.parametrize(
    "detail",
    [
        pytest.param(
            'duplicate key value violates unique constraint "pk_chat_messages"',
            id="duplicate-id",
        ),
        pytest.param(
            'violates check constraint "ck_chat_messages_text_length"', id="text"
        ),
        pytest.param(
            'violates foreign key constraint "fk_chat_messages_author_id_users"',
            id="author",
        ),
    ],
)
async def test_tg448_add_message_lets_other_integrity_errors_through(
    detail: str,
) -> None:
    failure = IntegrityError("INSERT", {}, Exception(detail))
    repository = _repository(FakeSession({"execute": failure}))

    with pytest.raises(IntegrityError):
        await repository.add_message(_message())


@pytest.mark.parametrize("failure", DB_FAILURES)
async def test_tg448_page_maps_a_database_failure(failure: Exception) -> None:
    repository = _repository(FakeSession({"scalars": failure}))

    with pytest.raises(ExternalServiceError) as error:
        await repository.page(uuid.uuid7(), None, 10)

    assert error.value.code == DATABASE_UNAVAILABLE


@pytest.mark.parametrize("limit", [0, -1])
async def test_tg448_page_rejects_a_limit_below_one(limit: int) -> None:
    session = FakeSession()

    with pytest.raises(ValueError, match="limit"):
        await _repository(session).page(uuid.uuid7(), None, limit)

    assert session.calls == []


@pytest.mark.parametrize("failure", DB_FAILURES)
async def test_tg448_list_rooms_of_maps_a_database_failure(
    failure: Exception,
) -> None:
    repository = _repository(FakeSession({"execute": failure}))

    with pytest.raises(ExternalServiceError) as error:
        await repository.list_rooms_of(uuid.uuid7())

    assert error.value.code == DATABASE_UNAVAILABLE


class _Rows:
    def __init__(self, rows: list[Any]) -> None:
        self._rows = rows

    def all(self) -> list[Any]:
        return self._rows


class _RecordingSession(FakeSession):
    """A session whose reads answer from memory, to count the statements."""

    def __init__(self, page_rows: list[Any], inserted: Any = None) -> None:
        super().__init__()
        self.page_rows = page_rows
        self.inserted = inserted

    async def scalars(self, *_: object) -> Any:
        self._go("scalars")
        return _Rows(self.page_rows)

    async def scalar(self, *_: object) -> Any:
        self._go("scalar")
        return self.inserted


async def test_tg469_page_of_an_empty_room_does_not_query_the_authors() -> None:
    session = _RecordingSession([])

    page = await _repository(session).page(uuid.uuid7(), None, 10)

    assert page.messages == []
    assert session.calls == ["scalars"]


async def test_tg469_a_winning_insert_returns_the_row_without_reading_it_back() -> None:
    message = ChatMessage(
        id=uuid.uuid7(),
        room_id=uuid.uuid7(),
        author=ChatAuthor(id=uuid.uuid7(), name="Ada"),
        client_message_id=uuid.uuid4(),
        text="Hola",
        sent_at=datetime(2026, 11, 17, 21, 0, tzinfo=UTC),
    )
    row = ChatMessageRow(
        id=message.id,
        room_id=message.room_id,
        author_id=message.author.id,
        text=message.text,
        sent_at=message.sent_at,
        client_message_id=message.client_message_id,
    )
    session = _RecordingSession([], inserted=row)

    stored = await _repository(session).add_message(message)

    assert stored == message
    assert session.calls == ["scalar", "commit"]
