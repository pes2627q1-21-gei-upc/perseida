import uuid
from datetime import date
from typing import Protocol

from app.domain.quiz.models import QuizAnswer, QuizQuestion


class QuizQuestionRepository(Protocol):
    """The bank of quiz questions, in a fixed order."""

    async def ids(self) -> list[uuid.UUID]:
        """Return the ids of every question, in bank order."""
        ...

    async def get(self, question_id: uuid.UUID) -> QuizQuestion:
        """Return the question with ``question_id``.

        Raises:
            LookupError: if there is no such question.
        """
        ...


class QuizDayRepository(Protocol):
    """The calendar of the quiz: which question each day has.

    A day keeps its question once it has one, even if the bank grows later.
    """

    async def get(self, quiz_date: date) -> uuid.UUID | None:
        """Return the id of the question of ``quiz_date``, or None if not set yet."""
        ...

    async def last_days(self) -> dict[uuid.UUID, date]:
        """Return, for each question already given, the last day it was given."""
        ...

    async def assign(self, quiz_date: date, question_id: uuid.UUID) -> uuid.UUID:
        """Give ``question_id`` to ``quiz_date`` unless the day already has one.

        Returns the question the day ends up with: the existing one if another
        request set it first, also when two requests arrive at once.
        """
        ...


class QuizAnswerRepository(Protocol):
    """Durable storage of the answers, at most one per user and day."""

    async def get(self, user_id: uuid.UUID, quiz_date: date) -> QuizAnswer | None:
        """Return the answer of ``user_id`` on ``quiz_date``, or None."""
        ...

    async def add(self, answer: QuizAnswer) -> None:
        """Store ``answer``.

        Raises:
            ConflictError: code QUIZ_ALREADY_ANSWERED if the user already has an
                answer for that day, also when two requests arrive at once.
        """
        ...
