from typing import Self

from fastapi import APIRouter, status
from pydantic import BaseModel, Field

from app.domain.health.models import HealthReport, HealthStatus
from app.infrastructure.health.dependencies import HealthServiceDep

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: HealthStatus = Field(
        ...,
        description="Estat general de salut del sistema (healthy, degraded, unhealthy)",
        examples=["ok"],
    )
    components: dict[str, HealthStatus] = Field(
        ...,
        description="Diccionari amb l'estat detallat de "
        "cada component o servei extern depenent",
        examples=[{"app": "ok"}],
    )

    @classmethod
    def from_report(cls, report: HealthReport) -> Self:
        return cls(status=report.status, components=dict(report.components))


@router.get(
    "/health",
    response_model=HealthResponse,
    status_code=status.HTTP_200_OK,
    summary="Comprovació de salut del sistema",
    description=(
        "Retorna l'estat de salut de l'API i de tots els "
        "seus components subjacents (base de dades, cau, etc.) "
        "per a tasques de monitoratge i healthcheck."
    ),
    response_description="L'estat de salut actual i el desglossament per components.",
    responses={
        200: {
            "description": "L'estat de salut actual i el desglossament per components.",
            "content": {
                "application/json": {
                    "example": {
                        "status": "ok",
                        "components": {"app": "ok"},
                    }
                }
            },
        },
        503: {
            "description": "Servei no disponible per fallada d'algun component.",
            "content": {
                "application/problem+json": {
                    "example": {
                        "type": "about:blank",
                        "title": "Service Unavailable",
                        "status": 503,
                        "detail": "Un o més components del sistema "
                        "no estan disponibles.",
                        "instance": "/api/health",
                        "code": "SERVICE_UNAVAILABLE",
                        "correlation_id": "3f0c2a52-8c1e-4a5e-9d0b-6a1f2f7c9b10",
                    }
                }
            },
        },
    },
)
async def get_health(service: HealthServiceDep) -> HealthResponse:
    """Endpoint encarregat de verificar la disponibilitat del servei."""
    return HealthResponse.from_report(await service.check())
