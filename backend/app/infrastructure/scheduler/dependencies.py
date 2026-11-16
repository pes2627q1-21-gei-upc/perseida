from functools import lru_cache

from app.infrastructure.scheduler.apscheduler import ApschedulerJobScheduler
from app.infrastructure.scheduler.config import SchedulerSettings


@lru_cache
def get_scheduler_settings() -> SchedulerSettings:
    return SchedulerSettings()


@lru_cache
def get_job_scheduler() -> ApschedulerJobScheduler:
    return ApschedulerJobScheduler(timezone=get_scheduler_settings().scheduler_timezone)
