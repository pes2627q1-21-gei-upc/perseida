import asyncio
import json
import os
import uuid
from collections.abc import AsyncIterator, Iterator
from datetime import UTC, date, datetime
from pathlib import Path

import pytest
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine

from alembic import command
from app.domain.quiz.models import QuizAnswer
from app.domain.quiz.rules import QUIZ_ALREADY_ANSWERED
from app.domain.shared.errors import ConflictError
from app.domain.shared.language import Language
from app.domain.users.models import User
from app.infrastructure.persistence.config import DatabaseSettings
from app.infrastructure.quiz.repository import (
    SqlQuizAnswerRepository,
    SqlQuizDayRepository,
    SqlQuizQuestionRepository,
)
from app.infrastructure.users.repository import SqlUserRepository
from tests.integration.isolation import row_counts

pytestmark = pytest.mark.skipif(
    not os.getenv("POSTGRES_HOST"),
    reason="PostgreSQL integration test requires POSTGRES_HOST",
)

DAY = date(2026, 11, 9)
# Days of the calendar only for these tests, far from any real use.
CALENDAR = (date(2099, 1, 1), date(2099, 1, 2), date(2099, 1, 5))
CALENDAR_DAY = CALENDAR[1]
PREFIX = "quiz-repo"
DAYS_IN_USE = text(
    "SELECT EXISTS (SELECT 1 FROM quiz_days WHERE quiz_date = ANY(:days))"
)
DELETE_DAYS = text("DELETE FROM quiz_days WHERE quiz_date = ANY(:days)")
DELETE_USERS = (
    text(
        "DELETE FROM user_identities WHERE user_id IN"
        " (SELECT id FROM users WHERE email LIKE :prefix)"
    ),
    text("DELETE FROM users WHERE email LIKE :prefix"),
)
SEED = Path(__file__).resolve().parents[2] / "alembic" / "seed" / "quiz_questions.json"
AT = datetime(2026, 11, 9, 12, 0, tzinfo=UTC)


@pytest.fixture(scope="module", autouse=True)
def _schema_at_head() -> None:
    backend_dir = Path(__file__).resolve().parents[2]
    config = Config(str(backend_dir / "alembic.ini"))
    config.set_main_option("script_location", str(backend_dir / "alembic"))
    config.attributes["configure_logger"] = False
    command.upgrade(config, "head")


@pytest.fixture(scope="module", autouse=True)
def _preexisting_data_is_kept(_schema_at_head: None) -> Iterator[None]:
    # The tests must leave the configured database as they found it.
    before = row_counts()
    yield
    assert row_counts() == before


@pytest.fixture
async def engine() -> AsyncIterator[AsyncEngine]:
    """Real commits (some tests need two requests at once), cleaned per test.

    The cleaning removes only rows of this module: its users (their answers go
    with them) and the days of CALENDAR, which must be free before the test.
    """
    engine = create_async_engine(DatabaseSettings().database_url)
    days = {"days": list(CALENDAR)}
    async with engine.connect() as connection:
        if await connection.scalar(DAYS_IN_USE, days):
            pytest.fail(f"The test days {CALENDAR} already have a question")
    try:
        yield engine
    finally:
        async with engine.begin() as connection:
            await connection.execute(DELETE_DAYS, days)
            for statement in DELETE_USERS:
                await connection.execute(statement, {"prefix": f"{PREFIX}-%"})
        await engine.dispose()


@pytest.fixture
def questions(engine: AsyncEngine) -> SqlQuizQuestionRepository:
    return SqlQuizQuestionRepository(async_sessionmaker(engine, expire_on_commit=False))


@pytest.fixture
def answers(engine: AsyncEngine) -> SqlQuizAnswerRepository:
    return SqlQuizAnswerRepository(async_sessionmaker(engine, expire_on_commit=False))


@pytest.fixture
def days(engine: AsyncEngine) -> SqlQuizDayRepository:
    return SqlQuizDayRepository(async_sessionmaker(engine, expire_on_commit=False))


@pytest.fixture
async def user(engine: AsyncEngine) -> User:
    unique = f"{PREFIX}-{uuid.uuid4().hex}"
    users = SqlUserRepository(async_sessionmaker(engine, expire_on_commit=False))
    return await users.add(
        User.create(google_sub=unique, email=f"{unique}@example.test")
    )


async def _answer(
    questions: SqlQuizQuestionRepository, user: User, chosen_option: int = 1
) -> QuizAnswer:
    return QuizAnswer.record(
        user_id=user.id,
        question=await questions.at_position(0),
        quiz_date=DAY,
        chosen_option=chosen_option,
        at=AT,
    )


async def test_tg60_c13_the_migration_loads_the_whole_bank(
    questions: SqlQuizQuestionRepository,
) -> None:
    assert await questions.count() == 100


async def test_tg60_c13_every_stored_question_is_complete(
    questions: SqlQuizQuestionRepository,
) -> None:
    # Reading through the domain model checks the 3 languages and 4 options.
    loaded = [await questions.at_position(n) for n in range(await questions.count())]

    assert len({question.id for question in loaded}) == 100


async def test_tg60_c2_positions_keep_the_order_of_the_bank(
    questions: SqlQuizQuestionRepository,
) -> None:
    first = await questions.at_position(0)

    assert first.in_language(Language.EN).statement == (
        "Which is the hottest planet in the solar system?"
    )
    assert (await questions.at_position(0)).id == first.id


async def test_a_position_outside_the_bank_is_an_error(
    questions: SqlQuizQuestionRepository,
) -> None:
    with pytest.raises(LookupError):
        await questions.at_position(100)


async def test_tg60_c5_a_saved_answer_is_read_back(
    questions: SqlQuizQuestionRepository, answers: SqlQuizAnswerRepository, user: User
) -> None:
    answer = await _answer(questions, user)

    await answers.add(answer)

    assert await answers.get(user.id, DAY) == answer
    assert await answers.get(user.id, date(2026, 11, 10)) is None


async def test_tg60_c6_a_second_answer_on_the_same_day_is_rejected(
    questions: SqlQuizQuestionRepository, answers: SqlQuizAnswerRepository, user: User
) -> None:
    first = await _answer(questions, user, chosen_option=1)
    await answers.add(first)

    with pytest.raises(ConflictError) as error:
        await answers.add(await _answer(questions, user, chosen_option=2))

    assert error.value.code == QUIZ_ALREADY_ANSWERED
    assert await answers.get(user.id, DAY) == first


async def test_tg60_c6_two_answers_at_once_store_only_one(
    questions: SqlQuizQuestionRepository, answers: SqlQuizAnswerRepository, user: User
) -> None:
    results = await asyncio.gather(
        answers.add(await _answer(questions, user, chosen_option=1)),
        answers.add(await _answer(questions, user, chosen_option=2)),
        return_exceptions=True,
    )

    assert sum(result is None for result in results) == 1
    assert sum(isinstance(result, ConflictError) for result in results) == 1


async def test_quiz_tables_follow_the_data_model_conventions(
    engine: AsyncEngine,
    questions: SqlQuizQuestionRepository,
    answers: SqlQuizAnswerRepository,
    user: User,
) -> None:
    # ADR-0023: UUIDv7 keys and named constraints.
    await answers.add(await _answer(questions, user))
    async with engine.connect() as connection:
        version = await connection.scalar(
            text(
                "SELECT uuid_extract_version(id) FROM quiz_answers WHERE user_id = :u"
            ),
            {"u": user.id},
        )
        unique = await connection.scalar(
            text(
                "SELECT conname FROM pg_constraint "
                "WHERE conrelid = 'quiz_answers'::regclass AND contype = 'u'"
            )
        )

    assert version == 7
    assert unique == "uq_quiz_answers_user_id"


async def test_the_stored_ids_are_the_fixed_ids_of_the_seed(
    questions: SqlQuizQuestionRepository,
) -> None:
    seed = json.loads(SEED.read_text(encoding="utf-8"))

    stored = [await questions.at_position(n) for n in range(len(seed))]

    assert [str(question.id) for question in stored] == [q["id"] for q in seed]


async def test_a_question_is_read_by_its_id(
    questions: SqlQuizQuestionRepository,
) -> None:
    first = await questions.at_position(0)

    assert await questions.get(first.id) == first


async def test_an_unknown_id_is_an_error(questions: SqlQuizQuestionRepository) -> None:
    with pytest.raises(LookupError):
        await questions.get(uuid.UUID(int=1))


async def test_tg60_c3_a_day_without_question_returns_none(
    days: SqlQuizDayRepository,
) -> None:
    assert await days.get(CALENDAR_DAY) is None


async def test_tg60_c3_the_first_question_given_to_a_day_stays(
    questions: SqlQuizQuestionRepository, days: SqlQuizDayRepository
) -> None:
    first, second = await questions.at_position(0), await questions.at_position(1)

    assert await days.assign(CALENDAR_DAY, first.id) == first.id
    assert await days.assign(CALENDAR_DAY, second.id) == first.id
    assert await days.get(CALENDAR_DAY) == first.id


async def test_tg60_c3_two_requests_at_once_agree_on_the_day_s_question(
    questions: SqlQuizQuestionRepository, days: SqlQuizDayRepository
) -> None:
    first, second = await questions.at_position(0), await questions.at_position(1)

    results = await asyncio.gather(
        days.assign(CALENDAR_DAY, first.id), days.assign(CALENDAR_DAY, second.id)
    )

    assert results[0] == results[1] == await days.get(CALENDAR_DAY)


async def test_tg60_c3_the_ids_come_in_bank_order(
    questions: SqlQuizQuestionRepository,
) -> None:
    seed = json.loads(SEED.read_text(encoding="utf-8"))

    assert [str(question_id) for question_id in await questions.ids()] == [
        question["id"] for question in seed
    ]


async def test_tg60_c3_the_calendar_gives_the_last_day_of_each_question(
    questions: SqlQuizQuestionRepository, days: SqlQuizDayRepository
) -> None:
    first, second = await questions.at_position(0), await questions.at_position(1)
    await days.assign(CALENDAR[0], first.id)
    await days.assign(CALENDAR[1], second.id)
    await days.assign(CALENDAR[2], first.id)

    last_days = await days.last_days()

    assert last_days[first.id] == CALENDAR[2]
    assert last_days[second.id] == CALENDAR[1]
