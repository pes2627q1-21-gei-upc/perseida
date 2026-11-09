import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlmodel import col

from app.domain.quiz.models import QuizAnswer, QuizQuestion
from app.domain.quiz.rules import QUIZ_ALREADY_ANSWERED
from app.domain.shared.errors import ConflictError
from app.infrastructure.quiz.tables import (
    QuizAnswerRow,
    QuizQuestionRow,
    QuizQuestionTranslationRow,
)


class SqlQuizQuestionRepository:
    """``QuizQuestionRepository`` on PostgreSQL. Each call uses its own session."""

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def count(self) -> int:
        async with self._session_factory() as session:
            total = await session.scalar(
                select(func.count()).select_from(QuizQuestionRow)
            )
        return total or 0

    async def at_position(self, position: int) -> QuizQuestion:
        async with self._session_factory() as session:
            row = await session.scalar(
                select(QuizQuestionRow).where(col(QuizQuestionRow.position) == position)
            )
            if row is None:
                raise LookupError(f"No quiz question at position {position}")
            translations = await session.scalars(
                select(QuizQuestionTranslationRow).where(
                    col(QuizQuestionTranslationRow.question_id) == row.id
                )
            )
            return QuizQuestion.model_validate(
                {
                    "id": row.id,
                    "correct_option": row.correct_option,
                    "source_url": row.source_url,
                    "translations": {
                        translation.language: {
                            "statement": translation.statement,
                            "options": translation.options,
                            "explanation": translation.explanation,
                        }
                        for translation in translations
                    },
                }
            )


def _to_answer(row: QuizAnswerRow) -> QuizAnswer:
    return QuizAnswer(
        user_id=row.user_id,
        quiz_date=row.quiz_date,
        question_id=row.question_id,
        chosen_option=row.chosen_option,
        correct=row.correct,
        answered_at=row.answered_at,
    )


class SqlQuizAnswerRepository:
    """``QuizAnswerRepository`` on PostgreSQL. Each call is its own transaction."""

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def get(self, user_id: uuid.UUID, quiz_date: date) -> QuizAnswer | None:
        async with self._session_factory() as session:
            row = await session.scalar(
                select(QuizAnswerRow).where(
                    col(QuizAnswerRow.user_id) == user_id,
                    col(QuizAnswerRow.quiz_date) == quiz_date,
                )
            )
        return None if row is None else _to_answer(row)

    async def add(self, answer: QuizAnswer) -> None:
        # ON CONFLICT DO NOTHING instead of insert + catch: with two requests at
        # once, the second one waits for the first and then skips.
        statement = (
            insert(QuizAnswerRow)
            .values(
                user_id=answer.user_id,
                quiz_date=answer.quiz_date,
                question_id=answer.question_id,
                chosen_option=answer.chosen_option,
                correct=answer.correct,
                answered_at=answer.answered_at,
            )
            .on_conflict_do_nothing(index_elements=["user_id", "quiz_date"])
            .returning(col(QuizAnswerRow.id))
        )
        async with self._session_factory() as session, session.begin():
            inserted = (await session.execute(statement)).scalar_one_or_none()
        if inserted is None:
            raise ConflictError(
                QUIZ_ALREADY_ANSWERED,
                f"User {answer.user_id} already answered the quiz of "
                f"{answer.quiz_date}",
            )
