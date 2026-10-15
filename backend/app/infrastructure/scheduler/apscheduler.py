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
            try:
                await func()
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
        """Stop the scheduler; APScheduler applies it on the next loop iteration."""
        self._scheduler.shutdown(wait=False)
        await asyncio.sleep(0)
