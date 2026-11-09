import json
import uuid
from pathlib import Path
from typing import Any

import pytest

from app.domain.quiz.models import QuizQuestion
from app.domain.users.models import Language

SEED = Path(__file__).resolve().parents[4] / "alembic" / "seed" / "quiz_questions.json"


@pytest.fixture(scope="module")
def bank() -> list[dict[str, Any]]:
    data: list[dict[str, Any]] = json.loads(SEED.read_text(encoding="utf-8"))
    return data


def test_tg60_c13_the_bank_has_a_hundred_questions(bank: list[dict[str, Any]]) -> None:
    assert len(bank) == 100


def test_tg60_c13_every_question_is_valid_in_every_language(
    bank: list[dict[str, Any]],
) -> None:
    # The domain checks the three languages, the 4 different options, the right
    # answer and the https source.
    for number, question in enumerate(bank, start=1):
        QuizQuestion.model_validate({"id": uuid.UUID(int=number), **question})


def test_tg60_c13_no_question_is_repeated(bank: list[dict[str, Any]]) -> None:
    for language in Language:
        statements = [q["translations"][language.value]["statement"] for q in bank]
        assert len(set(statements)) == len(statements)


def test_tg60_c13_the_right_answer_is_spread_over_the_four_options(
    bank: list[dict[str, Any]],
) -> None:
    # Nobody should be able to guess by always picking the same option.
    positions = [q["correct_option"] for q in bank]
    assert all(positions.count(option) >= 15 for option in range(4))
