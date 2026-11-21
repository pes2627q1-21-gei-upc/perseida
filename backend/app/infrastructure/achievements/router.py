from datetime import datetime
from typing import Any

from fastapi import APIRouter, status
from pydantic import BaseModel, Field

from app.application.achievements.achievement_service import AchievementProgress
from app.application.auth.errors import SESSION_UNAVAILABLE
from app.application.shared.error_codes import (
    ACCOUNT_DELETED,
    ACCOUNT_SUSPENDED,
    INVALID_SESSION,
)
from app.domain.achievements.models import AchievementCategory
from app.infrastructure.achievements.dependencies import AchievementServiceDep
from app.infrastructure.api.schemas import ProblemDetails
from app.infrastructure.auth.dependencies import CurrentSessionDep
from app.infrastructure.users.dependencies import UserServiceDep

router = APIRouter(prefix="/users", tags=["achievements"])

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


class AchievementResponse(BaseModel):
    code: str = Field(..., description="Codi estable de la fita")
    name: str = Field(..., description="Nom de la fita")
    description: str = Field(..., description="Descripció de la fita")
    category: AchievementCategory = Field(..., description="Categoria de la fita")
    position: int = Field(..., description="Posició dins de la categoria")
    current: int = Field(..., description="Progrés actual de l'usuari")
    goal: int = Field(..., description="Objectiu per desbloquejar la fita")
    unlocked: bool = Field(..., description="Si l'usuari l'ha desbloquejada")
    unlocked_at: datetime | None = Field(
        ..., description="Moment de desbloqueig (UTC), o null si no ho està"
    )

    @classmethod
    def from_progress(cls, item: AchievementProgress) -> "AchievementResponse":
        achievement = item.achievement
        return cls(
            code=achievement.code,
            name=achievement.name,
            description=achievement.description,
            category=achievement.category,
            position=achievement.position,
            current=item.current,
            goal=item.goal,
            unlocked=item.unlocked,
            unlocked_at=item.unlocked_at,
        )


@router.get(
    "/me/achievements",
    operation_id="list_my_achievements",
    response_model=list[AchievementResponse],
    status_code=status.HTTP_200_OK,
    summary="Fites de l'usuari autenticat",
    description=(
        "Retorna tot el catàleg de fites amb el progrés de l'usuari de la sessió, "
        "ordenat per categoria (streaks, quiz, events, social, minigame) i, dins "
        "de cada categoria, per posició."
    ),
    response_description="Les fites amb progrés i data de desbloqueig.",
    responses=_COMMON_RESPONSES,
)
async def list_my_achievements(
    session: CurrentSessionDep,
    users: UserServiceDep,
    service: AchievementServiceDep,
) -> list[AchievementResponse]:
    """Retorna les fites de l'usuari de la sessió."""
    user = await users.get_profile(session.sub)
    items = await service.list_progress(user.id)
    return [AchievementResponse.from_progress(item) for item in items]
