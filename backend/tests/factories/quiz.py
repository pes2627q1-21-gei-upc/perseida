import uuid
from typing import Any

from app.domain.quiz.models import QuizQuestion, QuizTranslation
from app.domain.shared.language import Language

QUESTION_ID = uuid.UUID("01a19288-a3f6-7576-a37b-8926ca81b8fe")


def make_translation(
    language: Language = Language.CA, **changes: Any
) -> QuizTranslation:
    values: dict[str, Any] = {
        "statement": f"Question ({language.value})",
        "options": tuple(f"Option {n} ({language.value})" for n in range(4)),
        "explanation": f"Explanation ({language.value})",
    }
    return QuizTranslation(**(values | changes))


def make_question(
    question_id: uuid.UUID = QUESTION_ID, correct_option: int = 1, **changes: Any
) -> QuizQuestion:
    values: dict[str, Any] = {
        "id": question_id,
        "correct_option": correct_option,
        "source_url": "https://science.nasa.gov/venus/facts",
        "translations": {language: make_translation(language) for language in Language},
    }
    return QuizQuestion(**(values | changes))
