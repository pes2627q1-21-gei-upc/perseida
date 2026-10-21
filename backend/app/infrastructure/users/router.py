from typing import Any, Self

from fastapi import APIRouter, status
from pydantic import BaseModel, Field

from app.application.auth.errors import (
    ACCOUNT_DELETED,
    ACCOUNT_SUSPENDED,
    INVALID_SESSION,
    SESSION_UNAVAILABLE,
)
from app.domain.users.models import Language, Role, User
from app.infrastructure.api.schemas import ProblemDetails
from app.infrastructure.auth.dependencies import CurrentSessionDep
from app.infrastructure.users.dependencies import UserServiceDep

router = APIRouter(prefix="/users", tags=["users"])

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


class UserResponse(BaseModel):
    id: str = Field(..., description="Identificador intern de l'usuari (UUID)")
    email: str = Field(..., description="Correu del compte de Google")
    display_name: str | None = Field(..., description="Nom del perfil de Google")
    avatar_url: str | None = Field(..., description="Avatar del perfil de Google")
    preferred_language: Language = Field(..., description="Idioma preferit")
    role: Role = Field(..., description="Rol de l'usuari")

    @classmethod
    def from_user(cls, user: User) -> Self:
        return cls(
            id=str(user.id),
            email=user.email,
            display_name=user.display_name,
            avatar_url=user.avatar_url,
            preferred_language=user.preferred_language,
            role=user.role,
        )


@router.get(
    "/me",
    operation_id="get_current_user",
    response_model=UserResponse,
    status_code=status.HTTP_200_OK,
    summary="Perfil de l'usuari autenticat",
    description="Retorna les dades de l'usuari propietari de la sessió.",
    response_description="El perfil de l'usuari.",
    responses={
        401: _problem(f"Sessió absent, invàlida o revocada (`{INVALID_SESSION}`)."),
        403: _problem(
            f"El compte és suspès (`{ACCOUNT_SUSPENDED}`) o esborrat "
            f"(`{ACCOUNT_DELETED}`)."
        ),
        503: _problem(f"No es pot comprovar la sessió (`{SESSION_UNAVAILABLE}`)."),
    },
)
async def get_current_user(
    session: CurrentSessionDep, service: UserServiceDep
) -> UserResponse:
    """Retorna el perfil de l'usuari de la sessió."""
    return UserResponse.from_user(await service.get_profile(session.sub))
