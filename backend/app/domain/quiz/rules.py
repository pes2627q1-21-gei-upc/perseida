import uuid
from datetime import date

from app.domain.shared.errors import ConflictError, ValidationError

QUIZ_ALREADY_ANSWERED = "QUIZ_ALREADY_ANSWERED"
QUIZ_EXPIRED = "QUIZ_EXPIRED"
QUIZ_QUESTION_MISMATCH = "QUIZ_QUESTION_MISMATCH"

# Day 0 of the rotation. Any fixed date works; changing it reshuffles the calendar.
ROTATION_START = date(2026, 1, 1)


def question_position(day: date, bank_size: int) -> int:
    """Return the position in the bank of the question of ``day``.

    The bank is walked in order, one question per day, so with ``bank_size``
    questions no question repeats within ``bank_size`` consecutive days.
    """
    if bank_size <= 0:
        raise ValueError("The quiz bank is empty")
    return (day - ROTATION_START).days % bank_size


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
