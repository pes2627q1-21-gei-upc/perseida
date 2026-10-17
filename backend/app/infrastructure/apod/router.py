import datetime as dt
from typing import Annotated, Any, Self

from fastapi import APIRouter, Query, status
from pydantic import BaseModel, Field

from app.domain.apod.models import Apod, MediaType
from app.infrastructure.api.schemas import ProblemDetails
from app.infrastructure.apod.dependencies import ApodServiceDep

router = APIRouter(tags=["apod"])

_PROBLEM_CONTENT: dict[str, Any] = {
    "application/problem+json": {
        "schema": {"$ref": "#/components/schemas/ProblemDetails"}
    }
}


class ApodResponse(BaseModel):
    date: dt.date = Field(..., description="Data de l'APOD", examples=["2026-10-14"])
    title: str = Field(..., description="Títol de la imatge o vídeo")
    explanation: str = Field(..., description="Explicació de la NASA")
    media_type: MediaType = Field(..., description="Tipus de contingut (image, video)")
    url: str = Field(..., description="URL del contingut multimèdia")
    copyright: str | None = Field(
        default=None, description="Autoria, si l'APOD no és de domini públic"
    )

    @classmethod
    def from_apod(cls, apod: Apod) -> Self:
        return cls(
            date=apod.apod_date,
            title=apod.title,
            explanation=apod.explanation,
            media_type=apod.media_type,
            url=apod.media_url,
            copyright=apod.copyright,
        )


@router.get(
    "/apod",
    operation_id="get_apod",
    response_model=ApodResponse,
    status_code=status.HTTP_200_OK,
    summary="Imatge astronòmica del dia (APOD)",
    description=(
        "Retorna l'APOD de la data indicada o, si no se'n dona cap, el d'avui "
        "(data UTC). La data ha d'estar entre el 16/06/1995 i avui."
    ),
    response_description="L'APOD de la data demanada.",
    responses={
        422: {
            "model": ProblemDetails,
            "description": "Data amb format incorrecte, futura o anterior al "
            "16/06/1995.",
            "content": _PROBLEM_CONTENT,
        },
        500: {
            "model": ProblemDetails,
            "description": "Error inesperat.",
            "content": _PROBLEM_CONTENT,
        },
        503: {
            "model": ProblemDetails,
            "description": "La NASA no respon i no hi ha dada a la cache.",
            "content": _PROBLEM_CONTENT,
        },
    },
)
async def get_apod(
    service: ApodServiceDep,
    day: Annotated[
        dt.date | None,
        Query(
            alias="date",
            description="Data de l'APOD (YYYY-MM-DD). Per defecte, avui.",
            examples=["2026-10-14"],
        ),
    ] = None,
) -> ApodResponse:
    """Retorna l'APOD d'avui o d'una data concreta."""
    return ApodResponse.from_apod(await service.get_apod(day))
