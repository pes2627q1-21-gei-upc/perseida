from typing import Self

from fastapi import APIRouter, status
from pydantic import BaseModel, Field

from app.domain.health.models import HealthReport, HealthStatus
from app.infrastructure.health.dependencies import HealthServiceDep

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: HealthStatus
    components: dict[str, HealthStatus]

    @classmethod
    def from_report(cls, report: HealthReport) -> Self:
        return cls(status=report.status, components=dict(report.components))

        @classmethod
        def from_report(cls, report: HealthReport) -> Self:
            return cls(status=report.status, components=dict(report.components))


@router.get("/health", response_model=HealthResponse,
            status_code = status.HTTP_200_OK,
            summary="Comprovació de salut del sistema",
            description="Retorna l'estat de salut de l'API i de tots els seus components" \
            "subjacents (base de dades, cau, etc.) per a tasques de monitoratge i healthcheck.",
            response_description="L'estat de salut actual i el desglossament per components.")
async def get_health(service: HealthServiceDep) -> HealthResponse:
    return HealthResponse.from_report(await service.check())
