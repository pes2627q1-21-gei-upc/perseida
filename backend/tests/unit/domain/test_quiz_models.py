import uuid
from datetime import UTC, date, datetime

import pytest
from pydantic import ValidationError as PydanticValidationError

from app.domain.quiz.models import QuizAnswer
from app.domain.shared.errors import ValidationError
from app.domain.users.models import Language
from tests.factories.quiz import QUESTION_ID, make_question, make_translation

USER_ID = uuid.UUID("01a19288-a3f6-7576-a37b-000000000001")
AT = datetime(2026, 11, 9, 12, 0, tzinfo=UTC)


def test_question_returns_its_texts_in_each_language() -> None:
    question = make_question()

    for language in Language:
        assert question.in_language(language) == make_translation(language)


def test_question_needs_every_language() -> None:
    with pytest.raises(ValidationError) as error:
        make_question(translations={Language.CA: make_translation(Language.CA)})

    assert error.value.code == "QUIZ_TRANSLATION_MISSING"


def test_question_needs_an_https_source() -> None:
    with pytest.raises(ValidationError) as error:
        make_question(source_url="http://example.test/fact")

    assert error.value.code == "QUIZ_SOURCE_URL_INVALID"


@pytest.mark.parametrize("correct_option", [-1, 4])
def test_correct_option_must_be_one_of_the_four(correct_option: int) -> None:
    with pytest.raises(PydanticValidationError):
        make_question(correct_option=correct_option)


def test_translation_needs_exactly_four_options() -> None:
    with pytest.raises(PydanticValidationError):
        make_translation(options=("a", "b", "c"))


def test_translation_rejects_repeated_options() -> None:
    with pytest.raises(ValidationError) as error:
        make_translation(options=("a", "b", "c", "a "))

    assert error.value.code == "QUIZ_OPTIONS_DUPLICATED"


@pytest.mark.parametrize(
    "changes",
    [
        {"statement": "  "},
        {"explanation": ""},
        {"options": ("a", "b", "c", "\n")},
    ],
)
def test_translation_rejects_empty_texts(changes: dict[str, object]) -> None:
    with pytest.raises(ValidationError) as error:
        make_translation(**changes)

    assert error.value.code == "QUIZ_TEXT_EMPTY"


def test_translation_strips_surrounding_blanks() -> None:
    translation = make_translation(
        statement="  Question?  ", options=(" a", "b ", "c", "d")
    )

    assert translation.statement == "Question?"
    assert translation.options == ("a", "b", "c", "d")


def test_question_knows_its_right_answer() -> None:
    question = make_question(correct_option=2)

    assert question.is_correct(2)
    assert not question.is_correct(0)


@pytest.mark.parametrize(("chosen_option", "correct"), [(1, True), (3, False)])
def test_answer_records_whether_it_is_right(chosen_option: int, correct: bool) -> None:
    answer = QuizAnswer.record(
        user_id=USER_ID,
        question=make_question(correct_option=1),
        quiz_date=date(2026, 11, 9),
        chosen_option=chosen_option,
        at=AT,
    )

    assert answer.question_id == QUESTION_ID
    assert answer.chosen_option == chosen_option
    assert answer.correct is correct
    assert answer.answered_at == AT


@pytest.mark.parametrize("chosen_option", [-1, 4])
def test_answer_needs_one_of_the_four_options(chosen_option: int) -> None:
    with pytest.raises(PydanticValidationError):
        QuizAnswer.record(
            user_id=USER_ID,
            question=make_question(),
            quiz_date=date(2026, 11, 9),
            chosen_option=chosen_option,
            at=AT,
        )


def test_question_is_immutable() -> None:
    question = make_question()

    with pytest.raises(PydanticValidationError):
        question.correct_option = 0  # type: ignore[misc]
