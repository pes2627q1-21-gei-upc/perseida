from app.domain.scheduler.ports import JobScheduler


class SchedulerCheck:
    """Liveness of the in-process job scheduler."""

    def __init__(self, scheduler: JobScheduler) -> None:
        self._scheduler = scheduler

    @property
    def name(self) -> str:
        return "scheduler"

    async def is_up(self) -> bool:
        return self._scheduler.running
