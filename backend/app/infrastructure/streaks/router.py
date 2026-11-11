from typing import Any

from fastapi import APIRouter, status
from pydantic import BaseModel, Field

from app.application.auth.errors import SESSION_UNAVAILABLE
from app.application.shared.error_codes import (
    ACCOUNT_DELETED,
    ACCOUNT_SUSPENDED,
    INVALID_SESSION,
)
from app.infrastructure.api.schemas import ProblemDetails
from app.infrastructure.auth.dependencies import CurrentSessionDep
from app.infrastructure.streaks.dependencies import StreakServiceDep
from app.infrastructure.users.dependencies import UserServiceDep

router = APIRouter(prefix="/streaks", tags=["streaks"])

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


_COMMON_RESPONSES: dict[int | str, dict[str, Any]] = {
    401: _problem(f"Sessió absent, invàlida o revocada (`{INVALID_SESSION}`)."),
    403: _problem(
        f"El compte és suspès (`{ACCOUNT_SUSPENDED}`) o esborrat (`{ACCOUNT_DELETED}`)."
    ),
    503: _problem(f"No es pot comprovar la sessió (`{SESSION_UNAVAILABLE}`)."),
}


class StreakResponse(BaseModel):
    current_count: int = Field(
        ..., description="Dies consecutius d'activitat de la ratxa vigent"
    )


@router.post(
    "/me/activity",
    operation_id="register_streak_activity",
    response_model=StreakResponse,
    status_code=status.HTTP_200_OK,
    summary="Registra l'activitat d'avui",
    description=(
        "Registra l'activitat del dia per a l'usuari de la sessió. "
        "És idempotent dins del mateix dia."
    ),
    response_description="La ratxa actual després de registrar l'activitat.",
    responses=_COMMON_RESPONSES,
)
async def register_streak_activity(
    session: CurrentSessionDep,
    users: UserServiceDep,
    service: StreakServiceDep,
) -> StreakResponse:
    """Registra l'activitat d'avui i retorna la ratxa."""
    user = await users.get_profile(session.sub)
    streak = await service.register_activity(user.id)
    return StreakResponse(current_count=streak.current_count)


@router.get(
    "/me",
    operation_id="get_current_streak",
    response_model=StreakResponse,
    status_code=status.HTTP_200_OK,
    summary="Ratxa actual de l'usuari autenticat",
    description=(
        "Retorna la ratxa vigent de l'usuari de la sessió; 0 si no en té "
        "o s'ha trencat."
    ),
    response_description="La ratxa actual.",
    responses=_COMMON_RESPONSES,
)
async def get_current_streak(
    session: CurrentSessionDep,
    users: UserServiceDep,
    service: StreakServiceDep,
) -> StreakResponse:
    """Retorna la ratxa vigent de l'usuari de la sessió."""
    user = await users.get_profile(session.sub)
    return StreakResponse(current_count=await service.get_current_streak(user.id))
