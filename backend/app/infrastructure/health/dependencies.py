from typing import Annotated

from fastapi import Depends
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from starlette.requests import HTTPConnection

from app.application.health.health_service import HealthService
from app.domain.health.ports import HealthCheck
from app.domain.scheduler.ports import JobScheduler
from app.infrastructure.health.checks import ApplicationCheck, PostgresCheck, RedisCheck
from app.infrastructure.scheduler.checks import SchedulerCheck


def build_health_service(
    session_factory: async_sessionmaker[AsyncSession],
    redis: Redis,
    scheduler: JobScheduler | None,
) -> HealthService:
    """Wire the health service; called once from the lifespan, which owns clients."""
    checks: list[HealthCheck] = [
        ApplicationCheck(),
        PostgresCheck(session_factory),
        RedisCheck(redis),
    ]
    if scheduler is not None:
        checks.append(SchedulerCheck(scheduler))
    return HealthService(checks=checks)


def get_health_service(conn: HTTPConnection) -> HealthService:
    # Built in the lifespan because its checks need the engine and Redis client.
    service: HealthService = conn.app.state.health_service
    return service


HealthServiceDep = Annotated[HealthService, Depends(get_health_service)]
