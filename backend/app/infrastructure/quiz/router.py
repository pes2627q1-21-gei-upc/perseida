import datetime as dt
import uuid
from typing import Annotated, Any, Self

from fastapi import APIRouter, Query, status
from pydantic import BaseModel, ConfigDict, Field

from app.application.auth.errors import SESSION_UNAVAILABLE
from app.application.quiz.quiz_service import DailyQuestion, TodayQuiz
from app.application.shared.error_codes import (
    ACCOUNT_DELETED,
    ACCOUNT_SUSPENDED,
    INVALID_SESSION,
)
from app.domain.quiz.models import QuizAnswer
from app.domain.quiz.rules import (
    QUIZ_ALREADY_ANSWERED,
    QUIZ_EXPIRED,
    QUIZ_QUESTION_MISMATCH,
)
from app.domain.shared.language import Language
from app.infrastructure.api.schemas import ProblemDetails
from app.infrastructure.auth.dependencies import CurrentSessionDep
from app.infrastructure.quiz.dependencies import QuizServiceDep
from app.infrastructure.users.dependencies import UserServiceDep

router = APIRouter(prefix="/quiz", tags=["quiz"])

_PROBLEM_CONTENT: dict[str, Any] = {
    "application/problem+json": {
        "schema": {"$ref": "#/components/schemas/ProblemDetails"}
    }
}


def _problem(description: str) -> dict[str, Any]:
    return {
        "model": ProblemDetails,
        "description": description,
        "content": _PROBLEM_CONTENT,
    }


_SESSION_ERRORS: dict[int | str, dict[str, Any]] = {
    401: _problem(f"Sessió absent, invàlida o revocada (`{INVALID_SESSION}`)."),
    403: _problem(
        f"El compte és suspès (`{ACCOUNT_SUSPENDED}`) o esborrat (`{ACCOUNT_DELETED}`)."
    ),
    422: _problem("`lang` no suportat o dades mal formades (`VALIDATION_ERROR`)."),
    503: _problem(f"No es pot comprovar la sessió (`{SESSION_UNAVAILABLE}`)."),
}

LangQuery = Annotated[
    Language | None,
    Query(
        description="Idioma dels textos (ca, es o en). Per defecte, l'idioma "
        "preferit de l'usuari."
    ),
]


class QuizResultResponse(BaseModel):
    chosen_option: int = Field(..., ge=0, le=3, description="Opció triada (0-3)")
    correct: bool = Field(..., description="Si l'opció triada és la correcta")
    correct_option: int = Field(..., ge=0, le=3, description="Opció correcta (0-3)")
    explanation: str = Field(..., description="Explicació de la resposta")
    source_url: str = Field(..., description="Font que confirma la resposta (https)")
    answered_at: dt.datetime = Field(..., description="Moment de la resposta (UTC)")

    @classmethod
    def build(cls, question: DailyQuestion, answer: QuizAnswer) -> Self:
        return cls(
            chosen_option=answer.chosen_option,
            correct=answer.correct,
            correct_option=question.correct_option,
            explanation=question.explanation,
            source_url=question.source_url,
            answered_at=answer.answered_at,
        )


class QuizTodayResponse(BaseModel):
    date: dt.date = Field(..., description="Dia UTC de la pregunta")
    question_id: uuid.UUID = Field(..., description="Identificador de la pregunta")
    language: Language = Field(..., description="Idioma dels textos")
    statement: str = Field(..., description="Enunciat de la pregunta")
    options: list[str] = Field(
        ..., min_length=4, max_length=4, description="Les 4 opcions, en ordre"
    )
    result: QuizResultResponse | None = Field(
        ..., description="Resultat de l'usuari, o null si encara no ha respost"
    )

    @classmethod
    def build(cls, quiz: TodayQuiz) -> Self:
        question = quiz.question
        return cls(
            date=question.quiz_date,
            question_id=question.question_id,
            language=question.language,
            statement=question.statement,
            options=list(question.options),
            result=(
                None
                if quiz.answer is None
                else QuizResultResponse.build(question, quiz.answer)
            ),
        )


class QuizAnswerRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    date: dt.date = Field(..., description="Dia UTC de la pregunta que es respon")
    question_id: uuid.UUID = Field(..., description="Identificador de la pregunta")
    chosen_option: int = Field(..., ge=0, le=3, description="Opció triada (0-3)")


@router.get(
    "/today",
    operation_id="get_quiz_today",
    response_model=QuizTodayResponse,
    status_code=status.HTTP_200_OK,
    summary="Pregunta del quiz diari",
    description=(
        "Retorna la pregunta del dia (UTC) en l'idioma demanat, sense la solució. "
        "Si l'usuari ja ha respost, inclou el seu resultat."
    ),
    response_description="La pregunta del dia.",
    responses=_SESSION_ERRORS,
)
async def get_quiz_today(
    session: CurrentSessionDep,
    users: UserServiceDep,
    quiz: QuizServiceDep,
    lang: LangQuery = None,
) -> QuizTodayResponse:
    """Retorna la pregunta del quiz d'avui."""
    user = await users.get_profile(session.sub)
    today = await quiz.today(user.id, lang or user.preferred_language)
    return QuizTodayResponse.build(today)


@router.post(
    "/today/answer",
    operation_id="answer_quiz_today",
    response_model=QuizResultResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Respon la pregunta del quiz diari",
    description=(
        "Desa la resposta de l'usuari a la pregunta d'avui (UTC) i retorna si és "
        "correcta, amb l'explicació i la font. Només s'hi pot respondre un cop."
    ),
    response_description="El resultat de la resposta.",
    responses={
        **_SESSION_ERRORS,
        400: _problem("El cos de la petició no es pot llegir (codificació no vàlida)."),
        409: _problem(
            f"Ja s'ha respost avui (`{QUIZ_ALREADY_ANSWERED}`) o la data no és la "
            f"d'avui (`{QUIZ_EXPIRED}`)."
        ),
        422: _problem(
            f"La pregunta no és la del dia (`{QUIZ_QUESTION_MISMATCH}`), `lang` no "
            "suportat o dades mal formades (`VALIDATION_ERROR`)."
        ),
    },
)
async def answer_quiz_today(
    body: QuizAnswerRequest,
    session: CurrentSessionDep,
    users: UserServiceDep,
    quiz: QuizServiceDep,
    lang: LangQuery = None,
) -> QuizResultResponse:
    """Desa la resposta a la pregunta d'avui."""
    user = await users.get_profile(session.sub)
    result = await quiz.answer(
        user_id=user.id,
        language=lang or user.preferred_language,
        quiz_date=body.date,
        question_id=body.question_id,
        chosen_option=body.chosen_option,
    )
    return QuizResultResponse.build(result.question, result.answer)
