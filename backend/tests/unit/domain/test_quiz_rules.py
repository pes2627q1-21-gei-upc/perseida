import uuid
from datetime import date, timedelta

import pytest

from app.domain.quiz.rules import (
    QUIZ_EXPIRED,
    QUIZ_QUESTION_MISMATCH,
    ROTATION_START,
    ensure_answerable,
    ensure_question_of_the_day,
    question_position,
)
from app.domain.shared.errors import ConflictError, ValidationError

TODAY = date(2026, 11, 9)


def test_the_day_decides_the_question() -> None:
    # 2026-11-09 is 312 days after ROTATION_START: 312 % 100 = 12.
    assert question_position(TODAY, 100) == 12


def test_no_question_repeats_within_the_size_of_the_bank() -> None:
    days = [TODAY + timedelta(days=n) for n in range(100)]

    assert len({question_position(day, 100) for day in days}) == 100


def test_the_bank_starts_again_after_its_last_question() -> None:
    assert question_position(TODAY + timedelta(days=100), 100) == question_position(
        TODAY, 100
    )


def test_the_rotation_starts_at_the_first_question() -> None:
    assert question_position(ROTATION_START, 100) == 0


@pytest.mark.parametrize(
    "day", [ROTATION_START - timedelta(days=1), date(2000, 1, 1), date(2100, 12, 31)]
)
def test_the_position_is_always_inside_the_bank(day: date) -> None:
    assert 0 <= question_position(day, 7) < 7


def test_an_empty_bank_has_no_question() -> None:
    with pytest.raises(ValueError):
        question_position(TODAY, 0)


def test_today_s_question_can_be_answered() -> None:
    ensure_answerable(TODAY, TODAY)


@pytest.mark.parametrize(
    "quiz_date", [TODAY - timedelta(days=1), TODAY + timedelta(days=1)]
)
def test_another_day_s_question_has_expired(quiz_date: date) -> None:
    with pytest.raises(ConflictError) as error:
        ensure_answerable(quiz_date, TODAY)

    assert error.value.code == QUIZ_EXPIRED


def test_the_question_of_the_day_is_accepted() -> None:
    question_id = uuid.UUID(int=1)

    ensure_question_of_the_day(question_id, question_id)


def test_another_question_is_rejected() -> None:
    with pytest.raises(ValidationError) as error:
        ensure_question_of_the_day(uuid.UUID(int=1), uuid.UUID(int=2))

    assert error.value.code == QUIZ_QUESTION_MISMATCH
