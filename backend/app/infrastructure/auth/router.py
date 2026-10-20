from typing import Any, Literal, Self

from fastapi import APIRouter, status
from pydantic import BaseModel, Field

from app.application.auth.errors import (
    ACCOUNT_DELETED,
    ACCOUNT_SUSPENDED,
    IDENTITY_PROVIDER_UNAVAILABLE,
    INVALID_GOOGLE_TOKEN,
    INVALID_SESSION,
    SESSION_UNAVAILABLE,
)
from app.domain.auth.models import SessionTokens
from app.infrastructure.api.schemas import ProblemDetails
from app.infrastructure.auth.dependencies import AuthServiceDep

router = APIRouter(prefix="/auth", tags=["auth"])

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


class GoogleLoginRequest(BaseModel):
    id_token: str = Field(
        ...,
        min_length=1,
        description="ID token que l'app obté de Google (OAuth2 amb PKCE)",
    )


class RefreshRequest(BaseModel):
    refresh_token: str = Field(
        ..., min_length=1, description="Refresh token vigent de la sessió"
    )


class TokenResponse(BaseModel):
    access_token: str = Field(..., description="Token d'accés (JWT) de curta durada")
    refresh_token: str = Field(..., description="Token de renovació (JWT), d'un sol ús")
    token_type: Literal["bearer"] = Field(
        default="bearer", description="Tipus de token; sempre `bearer`"
    )
    expires_in: int = Field(
        ..., description="Segons de vida de l'access token", examples=[900]
    )

    @classmethod
    def from_tokens(cls, tokens: SessionTokens) -> Self:
        return cls(
            access_token=tokens.access_token,
            refresh_token=tokens.refresh_token,
            expires_in=tokens.expires_in,
        )


@router.post(
    "/google",
    operation_id="login_with_google",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="Inici de sessió amb Google",
    description=(
        "Valida l'`id_token` de Google i retorna una sessió pròpia del backend "
        "(access i refresh token). El backend no desa cap contrasenya."
    ),
    response_description="La sessió: access token, refresh token i durada.",
    responses={
        401: _problem(
            f"El token de Google no és vàlid (code `{INVALID_GOOGLE_TOKEN}`)."
        ),
        403: _problem(
            f"El compte és suspès (`{ACCOUNT_SUSPENDED}`) o esborrat "
            f"(`{ACCOUNT_DELETED}`)."
        ),
        422: _problem("Cos de la petició incorrecte."),
        503: _problem(
            f"Google no respon (`{IDENTITY_PROVIDER_UNAVAILABLE}`) o no es pot "
            f"desar la sessió (`{SESSION_UNAVAILABLE}`)."
        ),
    },
)
async def login_with_google(
    body: GoogleLoginRequest, service: AuthServiceDep
) -> TokenResponse:
    """Canvia un ID token de Google per una sessió pròpia."""
    return TokenResponse.from_tokens(await service.login(body.id_token))


@router.post(
    "/refresh",
    operation_id="refresh_session",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="Renovació de la sessió",
    description=(
        "Canvia un refresh token vigent per un parell nou. El refresh anterior "
        "queda revocat: reutilitzar-lo és un error."
    ),
    response_description="El parell nou de tokens.",
    responses={
        401: _problem(
            f"Refresh token invàlid, caducat o ja utilitzat (code `{INVALID_SESSION}`)."
        ),
        422: _problem("Cos de la petició incorrecte."),
        503: _problem(f"No es pot comprovar la sessió (`{SESSION_UNAVAILABLE}`)."),
    },
)
async def refresh_session(
    body: RefreshRequest, service: AuthServiceDep
) -> TokenResponse:
    """Renova la sessió amb un refresh token."""
    return TokenResponse.from_tokens(await service.refresh(body.refresh_token))
