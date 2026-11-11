import uuid
from datetime import date, timedelta

import pytest

from app.domain.quiz.rules import (
    QUIZ_EXPIRED,
    QUIZ_QUESTION_MISMATCH,
    ensure_answerable,
    ensure_question_of_the_day,
    next_question,
)
from app.domain.shared.errors import ConflictError, ValidationError

TODAY = date(2026, 11, 9)
BANK = [uuid.UUID(int=n) for n in range(5)]


def test_tg60_c3_an_empty_calendar_starts_with_the_first_question() -> None:
    assert next_question(BANK, {}) == BANK[0]


def test_tg60_c3_questions_never_given_go_first_in_bank_order() -> None:
    last_days = {BANK[0]: TODAY, BANK[1]: TODAY + timedelta(days=1)}

    assert next_question(BANK, last_days) == BANK[2]


def test_tg60_c3_once_all_are_given_the_oldest_one_comes_back() -> None:
    last_days = {q: TODAY + timedelta(days=n) for n, q in enumerate(reversed(BANK))}

    assert next_question(BANK, last_days) == BANK[-1]


def test_tg60_c3_no_question_repeats_within_the_size_of_the_bank() -> None:
    last_days: dict[uuid.UUID, date] = {}
    picked = []
    for n in range(3 * len(BANK)):
        question = next_question(BANK, last_days)
        last_days[question] = TODAY + timedelta(days=n)
        picked.append(question)

    windows = [picked[i : i + len(BANK)] for i in range(len(picked) - len(BANK) + 1)]
    assert all(len(set(window)) == len(BANK) for window in windows)


def test_tg60_c3_a_grown_bank_does_not_repeat_the_question_of_yesterday() -> None:
    # Regression (PR #80): with 100 questions, day 100 gives the first one again;
    # if a question is added before day 101, day 101 must not repeat it.
    bank = [uuid.UUID(int=n) for n in range(100)]
    last_days = {q: TODAY - timedelta(days=100 - n) for n, q in enumerate(bank)}
    last_days[bank[0]] = TODAY  # day 100
    new = uuid.UUID(int=100)

    tomorrow = next_question([*bank, new], last_days)

    assert tomorrow == new
    assert tomorrow != bank[0]


def test_an_empty_bank_has_no_question() -> None:
    with pytest.raises(ValueError):
        next_question([], {})


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
