from typing import Annotated

from fastapi import Depends
from starlette.requests import HTTPConnection

from app.application.quiz.quiz_service import QuizService
from app.infrastructure.cache.dependencies import CacheDep
from app.infrastructure.quiz.repository import (
    SqlQuizAnswerRepository,
    SqlQuizDayRepository,
    SqlQuizQuestionRepository,
)


def get_quiz_service(conn: HTTPConnection, cache: CacheDep) -> QuizService:
    # Light objects over the lifespan resources (engine and Redis).
    session_factory = conn.app.state.session_factory
    return QuizService(
        SqlQuizQuestionRepository(session_factory),
        SqlQuizDayRepository(session_factory),
        SqlQuizAnswerRepository(session_factory),
        cache,
    )


QuizServiceDep = Annotated[QuizService, Depends(get_quiz_service)]
