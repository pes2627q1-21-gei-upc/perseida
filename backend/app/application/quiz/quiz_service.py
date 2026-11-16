import uuid
from collections.abc import Callable
from datetime import UTC, date, datetime, time, timedelta

from pydantic import BaseModel, ConfigDict, TypeAdapter

from app.application.shared.cache import get_or_load
from app.domain.quiz.models import QuizAnswer, QuizQuestion
from app.domain.quiz.ports import (
    QuizAnswerRepository,
    QuizDayRepository,
    QuizQuestionRepository,
)
from app.domain.quiz.rules import (
    ensure_answerable,
    ensure_question_of_the_day,
    next_question,
)
from app.domain.shared.language import Language
from app.domain.shared.ports import Cache


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _cache_key(day: date, language: Language) -> str:
    return f"quiz:daily:{day.isoformat()}:{language.value}"


def _seconds_until_tomorrow(now: datetime) -> int:
    """Seconds left of the UTC day of ``now``: the question changes at midnight."""
    tomorrow = datetime.combine(now.date() + timedelta(days=1), time.min, UTC)
    return max(1, int((tomorrow - now).total_seconds()))


class DailyQuestion(BaseModel):
    """The question of one day in one language, with its solution.

    It is what the cache stores; the API decides which fields each response shows.
    """

    model_config = ConfigDict(frozen=True)

    quiz_date: date
    question_id: uuid.UUID
    language: Language
    statement: str
    options: tuple[str, str, str, str]
    correct_option: int
    explanation: str
    source_url: str


class TodayQuiz(BaseModel):
    model_config = ConfigDict(frozen=True)

    question: DailyQuestion
    answer: QuizAnswer | None


class QuizResult(BaseModel):
    model_config = ConfigDict(frozen=True)

    question: DailyQuestion
    answer: QuizAnswer


_DAILY_QUESTION = TypeAdapter(DailyQuestion)


class QuizService:
    """The daily quiz: one question per UTC day, the same for everyone.

    The question of a day is stored in the calendar (``QuizDayRepository``) the
    first time it is asked, so every language, user and cache entry of that day
    agrees on it, even if the bank grows during the day.
    """

    def __init__(
        self,
        questions: QuizQuestionRepository,
        days: QuizDayRepository,
        answers: QuizAnswerRepository,
        cache: Cache,
        now: Callable[[], datetime] = _utc_now,
    ) -> None:
        self._questions = questions
        self._days = days
        self._answers = answers
        self._cache = cache
        self._now = now

    async def today(self, user_id: uuid.UUID, language: Language) -> TodayQuiz:
        """Return today's question in ``language`` and the user's answer, if any."""
        now = self._now()
        question = await self._daily_question(now, language)
        answer = await self._answers.get(user_id, question.quiz_date)
        return TodayQuiz(question=question, answer=answer)

    async def answer(
        self,
        *,
        user_id: uuid.UUID,
        language: Language,
        quiz_date: date,
        question_id: uuid.UUID,
        chosen_option: int,
    ) -> QuizResult:
        """Store the user's answer to today's question and return the result.

        Raises:
            ConflictError: QUIZ_EXPIRED if ``quiz_date`` is not today (UTC), or
                QUIZ_ALREADY_ANSWERED if the user already answered today.
            ValidationError: QUIZ_QUESTION_MISMATCH if ``question_id`` is not
                today's question.
        """
        now = self._now()
        ensure_answerable(quiz_date, now.date())
        question = await self._daily_question(now, language)
        ensure_question_of_the_day(question_id, question.question_id)
        answer = QuizAnswer(
            user_id=user_id,
            quiz_date=question.quiz_date,
            question_id=question.question_id,
            chosen_option=chosen_option,
            correct=chosen_option == question.correct_option,
            answered_at=now,
        )
        await self._answers.add(answer)
        return QuizResult(question=question, answer=answer)

    async def _daily_question(self, now: datetime, language: Language) -> DailyQuestion:
        day = now.date()
        return await get_or_load(
            self._cache,
            _cache_key(day, language),
            lambda: self._load(day, language),
            _DAILY_QUESTION,
            _seconds_until_tomorrow(now),
        )

    async def _load(self, day: date, language: Language) -> DailyQuestion:
        question = await self._question_of(day)
        texts = question.in_language(language)
        return DailyQuestion(
            quiz_date=day,
            question_id=question.id,
            language=language,
            statement=texts.statement,
            options=texts.options,
            correct_option=question.correct_option,
            explanation=texts.explanation,
            source_url=question.source_url,
        )

    async def _question_of(self, day: date) -> QuizQuestion:
        question_id = await self._days.get(day)
        if question_id is None:
            candidate = next_question(
                await self._questions.ids(), await self._days.last_days()
            )
            # Another request may have set the day first: its question wins.
            question_id = await self._days.assign(day, candidate)
        return await self._questions.get(question_id)
