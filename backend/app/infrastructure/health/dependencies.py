from functools import lru_cache
from typing import Annotated

from fastapi import Depends

from app.application.health.health_service import HealthService
from app.infrastructure.health.checks import ApplicationCheck


@lru_cache
def get_health_service() -> HealthService:
    return HealthService(checks=[ApplicationCheck()])


HealthServiceDep = Annotated[HealthService, Depends(get_health_service)]
