import asyncio
import logging
from collections.abc import Awaitable, Callable

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger(__name__)


class ApschedulerJobScheduler:
    """``JobScheduler`` adapter on top of APScheduler's ``AsyncIOScheduler``."""

    def __init__(self, timezone: str = "UTC") -> None:
        self._timezone = timezone
        self._running_jobs: set[asyncio.Task[object]] = set()
        self._scheduler = AsyncIOScheduler(
            timezone=timezone,
            job_defaults={"max_instances": 1, "coalesce": True},
        )

    @property
    def running(self) -> bool:
        return bool(self._scheduler.running)

    def add_interval_job(
        self,
        name: str,
        func: Callable[[], Awaitable[None]],
        *,
        seconds: float,
    ) -> None:
        async def run() -> None:
            if (task := asyncio.current_task()) is not None:
                self._running_jobs.add(task)
                task.add_done_callback(self._running_jobs.discard)
            try:
                await func()
            except asyncio.CancelledError:
                # Shutdown cancels in-flight jobs; end quietly instead of letting
                # APScheduler log the cancellation as a job error.
                logger.info("Scheduled job %s cancelled on shutdown", name)
            except Exception:
                logger.exception("Scheduled job %s failed", name, extra={"job": name})

        self._scheduler.add_job(
            run,
            IntervalTrigger(seconds=seconds, timezone=self._timezone),
            id=name,
            name=name,
            replace_existing=True,
        )

    def start(self) -> None:
        self._scheduler.start()

    async def shutdown(self) -> None:
        """Stop the scheduler, cancelling in-flight jobs and waiting for them to end."""
        if not self._scheduler.running:
            return
        self._scheduler.shutdown(wait=False)
        await asyncio.sleep(0)
        if self._running_jobs:
            await asyncio.gather(*self._running_jobs, return_exceptions=True)
