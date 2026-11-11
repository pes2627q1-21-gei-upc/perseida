import uuid
from collections.abc import Mapping, Sequence
from datetime import date

from app.domain.shared.errors import ConflictError, ValidationError

QUIZ_ALREADY_ANSWERED = "QUIZ_ALREADY_ANSWERED"
QUIZ_EXPIRED = "QUIZ_EXPIRED"
QUIZ_QUESTION_MISMATCH = "QUIZ_QUESTION_MISMATCH"


def next_question(
    bank: Sequence[uuid.UUID], last_days: Mapping[uuid.UUID, date]
) -> uuid.UUID:
    """Return the question to give to a new day of the calendar.

    ``bank`` holds the ids in bank order and ``last_days`` the last day each
    question was given. A question never given goes first (in bank order);
    otherwise, the one given longest ago. A question only comes back when every
    other question has been given after it, so no question repeats within as
    many consecutive days as the bank has questions, even when the bank grows:
    the new questions come before any repeat.
    """
    if not bank:
        raise ValueError("The quiz bank is empty")
    return min(bank, key=lambda question_id: last_days.get(question_id, date.min))


def ensure_answerable(quiz_date: date, today: date) -> None:
    """Check that the question of ``quiz_date`` can still be answered.

    Raises:
        ConflictError: code QUIZ_EXPIRED if ``quiz_date`` is not ``today``.
    """
    if quiz_date != today:
        raise ConflictError(
            QUIZ_EXPIRED, f"The quiz of {quiz_date} cannot be answered on {today}"
        )


def ensure_question_of_the_day(question_id: uuid.UUID, expected: uuid.UUID) -> None:
    """Check that ``question_id`` is the question of the day.

    Raises:
        ValidationError: code QUIZ_QUESTION_MISMATCH if it is another question.
    """
    if question_id != expected:
        raise ValidationError(
            QUIZ_QUESTION_MISMATCH, f"Question {question_id} is not today's question"
        )
