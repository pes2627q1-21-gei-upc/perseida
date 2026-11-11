import uuid
from collections.abc import Iterable
from datetime import date

from app.domain.quiz.models import QuizAnswer, QuizQuestion
from app.domain.quiz.rules import QUIZ_ALREADY_ANSWERED
from app.domain.shared.errors import ConflictError


class FakeQuizQuestionRepository:
    """In-memory bank. Records the positions it was asked for."""

    def __init__(self, questions: Iterable[QuizQuestion]) -> None:
        self._questions = list(questions)
        self.requested: list[int] = []

    async def count(self) -> int:
        return len(self._questions)

    async def at_position(self, position: int) -> QuizQuestion:
        self.requested.append(position)
        return self._questions[position]

    async def get(self, question_id: uuid.UUID) -> QuizQuestion:
        for question in self._questions:
            if question.id == question_id:
                return question
        raise LookupError(question_id)

    def grow(self, question: QuizQuestion) -> None:
        """Add a question at the end of the bank, as a new seed would."""
        self._questions.append(question)


class FakeQuizDayRepository:
    """In-memory calendar: the first question given to a day stays."""

    def __init__(self) -> None:
        self.stored: dict[date, uuid.UUID] = {}

    async def get(self, quiz_date: date) -> uuid.UUID | None:
        return self.stored.get(quiz_date)

    async def assign(self, quiz_date: date, question_id: uuid.UUID) -> uuid.UUID:
        return self.stored.setdefault(quiz_date, question_id)


class FakeQuizAnswerRepository:
    """In-memory answers, at most one per user and day."""

    def __init__(self) -> None:
        self.stored: dict[tuple[uuid.UUID, date], QuizAnswer] = {}

    async def get(self, user_id: uuid.UUID, quiz_date: date) -> QuizAnswer | None:
        return self.stored.get((user_id, quiz_date))

    async def add(self, answer: QuizAnswer) -> None:
        key = (answer.user_id, answer.quiz_date)
        if key in self.stored:
            raise ConflictError(QUIZ_ALREADY_ANSWERED)
        self.stored[key] = answer
