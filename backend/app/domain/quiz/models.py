import uuid
from datetime import date, datetime
from typing import Self

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.domain.shared.errors import ValidationError
from app.domain.shared.language import Language
from app.domain.shared.text import clean_text, safe_https_url

OPTION_COUNT = 4
TEXT_MAX_LENGTH = 1000


class QuizTranslation(BaseModel):
    """Texts of a quiz question in one language."""

    model_config = ConfigDict(frozen=True)

    statement: str
    options: tuple[str, str, str, str]
    explanation: str

    @field_validator("statement", "explanation")
    @classmethod
    def _require_text(cls, value: str) -> str:
        cleaned = clean_text(value, TEXT_MAX_LENGTH)
        if cleaned is None:
            raise ValidationError("QUIZ_TEXT_EMPTY", "Quiz text must not be empty")
        return cleaned

    @field_validator("options")
    @classmethod
    def _require_distinct_options(
        cls, value: tuple[str, str, str, str]
    ) -> tuple[str, str, str, str]:
        cleaned = tuple(clean_text(option, TEXT_MAX_LENGTH) for option in value)
        if any(option is None for option in cleaned):
            raise ValidationError("QUIZ_TEXT_EMPTY", "Quiz options must not be empty")
        if len(set(cleaned)) != OPTION_COUNT:
            raise ValidationError(
                "QUIZ_OPTIONS_DUPLICATED", "Quiz options must be different"
            )
        return cleaned  # type: ignore[return-value]


class QuizQuestion(BaseModel):
    """A question of the daily quiz, with the same answer in every language.

    ``correct_option`` is the position of the right answer in ``options``, and the
    options keep that order in every language.
    """

    model_config = ConfigDict(frozen=True)

    id: uuid.UUID
    correct_option: int = Field(ge=0, lt=OPTION_COUNT)
    source_url: str
    translations: dict[Language, QuizTranslation]

    @field_validator("source_url")
    @classmethod
    def _require_https_source(cls, value: str) -> str:
        url = safe_https_url(value)
        if url is None:
            raise ValidationError(
                "QUIZ_SOURCE_URL_INVALID", "Quiz source URL is not https"
            )
        return url

    @field_validator("translations")
    @classmethod
    def _require_every_language(
        cls, value: dict[Language, QuizTranslation]
    ) -> dict[Language, QuizTranslation]:
        if set(value) != set(Language):
            raise ValidationError(
                "QUIZ_TRANSLATION_MISSING",
                "Quiz question must have a translation for every language",
            )
        return value

    def in_language(self, language: Language) -> QuizTranslation:
        """Return the texts of the question in ``language``."""
        return self.translations[language]

    def is_correct(self, option: int) -> bool:
        """Return whether ``option`` is the position of the right answer."""
        return option == self.correct_option


class QuizAnswer(BaseModel):
    """The answer a user gave to the question of one day (``QuizResult``)."""

    model_config = ConfigDict(frozen=True)

    user_id: uuid.UUID
    quiz_date: date
    question_id: uuid.UUID
    chosen_option: int = Field(ge=0, lt=OPTION_COUNT)
    correct: bool
    answered_at: datetime

    @classmethod
    def record(
        cls,
        *,
        user_id: uuid.UUID,
        question: QuizQuestion,
        quiz_date: date,
        chosen_option: int,
        at: datetime,
    ) -> Self:
        """Build the answer of ``user_id`` to ``question``, right or wrong."""
        return cls(
            user_id=user_id,
            quiz_date=quiz_date,
            question_id=question.id,
            chosen_option=chosen_option,
            correct=question.is_correct(chosen_option),
            answered_at=at,
        )
