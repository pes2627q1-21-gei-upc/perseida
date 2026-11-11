import uuid
from datetime import UTC, date, datetime, timedelta

import pytest

from app.application.quiz.quiz_service import QuizService
from app.domain.quiz.rules import (
    QUIZ_ALREADY_ANSWERED,
    QUIZ_EXPIRED,
    QUIZ_QUESTION_MISMATCH,
    question_position,
)
from app.domain.shared.errors import ConflictError, ValidationError
from app.domain.shared.language import Language
from tests.factories.quiz import make_question, make_translation
from tests.fakes.cache import FakeCache
from tests.fakes.quiz import (
    FakeQuizAnswerRepository,
    FakeQuizDayRepository,
    FakeQuizQuestionRepository,
)

NOW = datetime(2026, 11, 9, 10, 0, tzinfo=UTC)
TODAY = NOW.date()
ALICE = uuid.UUID(int=1)
BOB = uuid.UUID(int=2)
BANK = [make_question(uuid.UUID(int=100 + n), correct_option=n % 4) for n in range(5)]
TODAYS = BANK[question_position(TODAY, len(BANK))]


class MissingCache:
    """A cache whose backend is down: every read misses and writes do nothing."""

    async def get(self, key: str) -> str | None:
        return None

    async def set(self, key: str, value: str, ttl_seconds: int | None = None) -> None:
        return None


def make_service(
    now: datetime = NOW,
    cache: FakeCache | MissingCache | None = None,
    days: FakeQuizDayRepository | None = None,
    questions: FakeQuizQuestionRepository | None = None,
) -> tuple[QuizService, FakeQuizQuestionRepository, FakeQuizAnswerRepository]:
    questions = questions or FakeQuizQuestionRepository(BANK)
    answers = FakeQuizAnswerRepository()
    service = QuizService(
        questions,
        days or FakeQuizDayRepository(),
        answers,
        cache or FakeCache(),
        now=lambda: now,
    )
    return service, questions, answers


async def test_tg60_c1_today_returns_the_question_of_the_day_in_the_language() -> None:
    service, _, _ = make_service()

    quiz = await service.today(ALICE, Language.ES)

    assert quiz.question.quiz_date == TODAY
    assert quiz.question.question_id == TODAYS.id
    assert quiz.question.language is Language.ES
    assert quiz.question.statement == make_translation(Language.ES).statement
    assert quiz.question.options == make_translation(Language.ES).options
    assert quiz.answer is None


async def test_tg60_c2_everybody_gets_the_same_question_in_any_language() -> None:
    service, _, _ = make_service()

    ids = {
        (await service.today(user, language)).question.question_id
        for user in (ALICE, BOB)
        for language in Language
    }

    assert ids == {TODAYS.id}


async def test_tg60_c3_the_next_day_brings_the_next_question() -> None:
    tomorrow = NOW + timedelta(days=1)
    service, _, _ = make_service(now=tomorrow)

    quiz = await service.today(ALICE, Language.CA)

    position = question_position(tomorrow.date(), len(BANK))
    assert quiz.question.question_id == BANK[position].id


async def test_tg60_c11_the_question_comes_from_the_cache_until_midnight() -> None:
    cache = FakeCache()
    service, questions, _ = make_service(cache=cache)

    first = await service.today(ALICE, Language.CA)
    second = await service.today(BOB, Language.CA)

    assert first.question == second.question
    assert len(questions.requested) == 1
    key = "quiz:daily:2026-11-09:ca"
    assert key in cache.values
    assert cache.ttls[key] == 14 * 60 * 60  # from 10:00 UTC to midnight


async def test_tg60_c11_each_language_has_its_own_cache_entry() -> None:
    cache = FakeCache()
    service, _, _ = make_service(cache=cache)

    await service.today(ALICE, Language.CA)
    await service.today(ALICE, Language.EN)

    assert set(cache.values) == {"quiz:daily:2026-11-09:ca", "quiz:daily:2026-11-09:en"}


async def test_tg60_c12_without_redis_the_question_comes_from_the_database() -> None:
    service, questions, _ = make_service(cache=MissingCache())

    quiz = await service.today(ALICE, Language.CA)

    assert quiz.question.question_id == TODAYS.id
    assert len(questions.requested) == 1


async def test_the_day_changes_at_midnight_utc() -> None:
    late = datetime(2026, 11, 9, 23, 30, tzinfo=UTC)
    service, _, _ = make_service(now=late)

    quiz = await service.today(ALICE, Language.CA)

    assert quiz.question.quiz_date == date(2026, 11, 9)


@pytest.mark.parametrize("right", [True, False])
async def test_tg60_c5_an_answer_is_stored_with_its_result(right: bool) -> None:
    service, _, answers = make_service()
    chosen = TODAYS.correct_option if right else (TODAYS.correct_option + 1) % 4

    result = await service.answer(
        user_id=ALICE,
        language=Language.EN,
        quiz_date=TODAY,
        question_id=TODAYS.id,
        chosen_option=chosen,
    )

    assert result.answer.correct is right
    assert result.answer.chosen_option == chosen
    assert result.answer.answered_at == NOW
    assert result.question.correct_option == TODAYS.correct_option
    assert result.question.explanation == make_translation(Language.EN).explanation
    assert result.question.source_url == TODAYS.source_url
    assert answers.stored[(ALICE, TODAY)] == result.answer


async def test_tg60_c7_today_includes_the_answer_once_given() -> None:
    service, _, _ = make_service()
    result = await service.answer(
        user_id=ALICE,
        language=Language.CA,
        quiz_date=TODAY,
        question_id=TODAYS.id,
        chosen_option=0,
    )

    assert (await service.today(ALICE, Language.CA)).answer == result.answer
    assert (await service.today(BOB, Language.CA)).answer is None


async def test_tg60_c6_a_second_answer_is_rejected_and_the_first_one_stays() -> None:
    service, _, answers = make_service()
    first = await service.answer(
        user_id=ALICE,
        language=Language.CA,
        quiz_date=TODAY,
        question_id=TODAYS.id,
        chosen_option=0,
    )

    with pytest.raises(ConflictError) as error:
        await service.answer(
            user_id=ALICE,
            language=Language.CA,
            quiz_date=TODAY,
            question_id=TODAYS.id,
            chosen_option=1,
        )

    assert error.value.code == QUIZ_ALREADY_ANSWERED
    assert answers.stored[(ALICE, TODAY)] == first.answer


async def test_tg60_c8_another_day_s_question_has_expired() -> None:
    service, _, answers = make_service()

    with pytest.raises(ConflictError) as error:
        await service.answer(
            user_id=ALICE,
            language=Language.CA,
            quiz_date=TODAY - timedelta(days=1),
            question_id=TODAYS.id,
            chosen_option=0,
        )

    assert error.value.code == QUIZ_EXPIRED
    assert answers.stored == {}


async def test_tg60_c9_another_question_is_rejected() -> None:
    service, _, answers = make_service()
    other = next(question for question in BANK if question.id != TODAYS.id)

    with pytest.raises(ValidationError) as error:
        await service.answer(
            user_id=ALICE,
            language=Language.CA,
            quiz_date=TODAY,
            question_id=other.id,
            chosen_option=0,
        )

    assert error.value.code == QUIZ_QUESTION_MISMATCH
    assert answers.stored == {}


async def test_tg60_c3_the_question_of_a_day_is_stored_in_the_calendar() -> None:
    days = FakeQuizDayRepository()
    service, _, _ = make_service(days=days)

    await service.today(ALICE, Language.CA)

    assert days.stored == {TODAY: TODAYS.id}


async def test_tg60_c2_a_day_keeps_its_question_when_the_bank_grows() -> None:
    # One language is cached before the bank grows and the other is not:
    # both must still show the same question, with its own solution.
    days = FakeQuizDayRepository()
    questions = FakeQuizQuestionRepository(BANK)
    service, _, _ = make_service(days=days, questions=questions)
    before = await service.today(ALICE, Language.CA)

    questions.grow(make_question(uuid.UUID(int=999), correct_option=3))
    assert question_position(TODAY, len(BANK) + 1) != question_position(
        TODAY, len(BANK)
    )
    after = await service.today(BOB, Language.EN)
    result = await service.answer(
        user_id=BOB,
        language=Language.EN,
        quiz_date=TODAY,
        question_id=before.question.question_id,
        chosen_option=TODAYS.correct_option,
    )

    assert after.question.question_id == before.question.question_id == TODAYS.id
    assert result.answer.correct is True
    assert result.question.correct_option == TODAYS.correct_option


async def test_tg60_c12_without_redis_a_grown_bank_keeps_the_day_s_question() -> None:
    days = FakeQuizDayRepository()
    questions = FakeQuizQuestionRepository(BANK)
    first, _, _ = make_service(cache=MissingCache(), days=days, questions=questions)
    await first.today(ALICE, Language.CA)
    questions.grow(make_question(uuid.UUID(int=999)))

    quiz = await first.today(BOB, Language.ES)

    assert quiz.question.question_id == TODAYS.id


async def test_a_day_set_by_another_request_wins_over_the_rotation() -> None:
    other = next(question for question in BANK if question.id != TODAYS.id)
    days = FakeQuizDayRepository()
    days.stored[TODAY] = other.id
    service, _, _ = make_service(days=days)

    quiz = await service.today(ALICE, Language.CA)

    assert quiz.question.question_id == other.id


class RacingDays(FakeQuizDayRepository):
    """A calendar where another request fixes the day just before this one."""

    def __init__(self, winner: uuid.UUID) -> None:
        super().__init__()
        self._winner = winner

    async def assign(self, quiz_date: date, question_id: uuid.UUID) -> uuid.UUID:
        self.stored.setdefault(quiz_date, self._winner)
        return await super().assign(quiz_date, question_id)


async def test_when_two_requests_race_both_get_the_question_stored_first() -> None:
    other = next(question for question in BANK if question.id != TODAYS.id)
    service, _, _ = make_service(days=RacingDays(other.id))

    quiz = await service.today(ALICE, Language.CA)

    assert quiz.question.question_id == other.id
