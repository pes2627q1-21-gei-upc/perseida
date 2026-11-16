from collections.abc import Awaitable, Callable
from typing import Protocol


class JobScheduler(Protocol):
    @property
    def running(self) -> bool:
        """Whether the scheduler is started and processing jobs."""
        ...

    def add_interval_job(
        self,
        name: str,
        func: Callable[[], Awaitable[None]],
        *,
        seconds: float,
    ) -> None:
        """Run ``func`` every ``seconds``, never two instances at once.

        ``name`` identifies the job; registering it again replaces the previous one.
        A raising job is logged and never stops the scheduler.
        """
        ...
