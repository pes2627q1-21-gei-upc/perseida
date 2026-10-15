from functools import lru_cache
from typing import Annotated

from fastapi import Depends

from app.application.health.health_service import HealthService
from app.domain.health.ports import HealthCheck
from app.infrastructure.health.checks import ApplicationCheck
from app.infrastructure.scheduler.checks import SchedulerCheck
from app.infrastructure.scheduler.config import SchedulerSettings
from app.infrastructure.scheduler.dependencies import get_job_scheduler


@lru_cache
def get_health_service() -> HealthService:
    checks: list[HealthCheck] = [ApplicationCheck()]
    if SchedulerSettings().scheduler_enabled:
        checks.append(SchedulerCheck(get_job_scheduler()))
    return HealthService(checks=checks)


HealthServiceDep = Annotated[HealthService, Depends(get_health_service)]
