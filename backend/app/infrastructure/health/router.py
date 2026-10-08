from typing import Self

from fastapi import APIRouter
from pydantic import BaseModel

from app.domain.health.models import HealthReport, HealthStatus
from app.infrastructure.health.dependencies import HealthServiceDep

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: HealthStatus
    components: dict[str, HealthStatus]

    @classmethod
    def from_report(cls, report: HealthReport) -> Self:
        return cls(status=report.status, components=dict(report.components))


@router.get("/health", response_model=HealthResponse)
async def get_health(service: HealthServiceDep) -> HealthResponse:
    return HealthResponse.from_report(await service.check())
