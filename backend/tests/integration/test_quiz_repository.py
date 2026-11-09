import asyncio
import os
import uuid
from collections.abc import AsyncIterator
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
from app.domain.users.models import Language, User
from app.infrastructure.persistence.config import DatabaseSettings
from app.infrastructure.quiz.repository import (
    SqlQuizAnswerRepository,
    SqlQuizQuestionRepository,
)
from app.infrastructure.users.repository import SqlUserRepository

pytestmark = pytest.mark.skipif(
    not os.getenv("POSTGRES_HOST"),
    reason="PostgreSQL integration test requires POSTGRES_HOST",
)

DAY = date(2026, 11, 9)
AT = datetime(2026, 11, 9, 12, 0, tzinfo=UTC)


@pytest.fixture(scope="module", autouse=True)
def _schema_at_head() -> None:
    backend_dir = Path(__file__).resolve().parents[2]
    config = Config(str(backend_dir / "alembic.ini"))
    config.set_main_option("script_location", str(backend_dir / "alembic"))
    config.attributes["configure_logger"] = False
    command.upgrade(config, "head")


@pytest.fixture
async def engine() -> AsyncIterator[AsyncEngine]:
    engine = create_async_engine(DatabaseSettings().database_url)
    try:
        yield engine
    finally:
        async with engine.begin() as connection:
            await connection.execute(text("DELETE FROM quiz_answers"))
            await connection.execute(
                text("DELETE FROM user_identities WHERE subject LIKE 'quiz-%'")
            )
            await connection.execute(
                text("DELETE FROM users WHERE email LIKE 'quiz-%'")
            )
        await engine.dispose()


@pytest.fixture
def questions(engine: AsyncEngine) -> SqlQuizQuestionRepository:
    return SqlQuizQuestionRepository(async_sessionmaker(engine, expire_on_commit=False))


@pytest.fixture
def answers(engine: AsyncEngine) -> SqlQuizAnswerRepository:
    return SqlQuizAnswerRepository(async_sessionmaker(engine, expire_on_commit=False))


@pytest.fixture
async def user(engine: AsyncEngine) -> User:
    unique = uuid.uuid4().hex
    users = SqlUserRepository(async_sessionmaker(engine, expire_on_commit=False))
    return await users.add(
        User.create(google_sub=f"quiz-{unique}", email=f"quiz-{unique}@example.test")
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
            text("SELECT uuid_extract_version(id) FROM quiz_answers")
        )
        unique = await connection.scalar(
            text(
                "SELECT conname FROM pg_constraint "
                "WHERE conrelid = 'quiz_answers'::regclass AND contype = 'u'"
            )
        )

    assert version == 7
    assert unique == "uq_quiz_answers_user_id"
