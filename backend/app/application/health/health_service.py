import asyncio
import logging
from collections.abc import Sequence

from app.domain.health.models import HealthReport
from app.domain.health.ports import HealthCheck

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT_SECONDS = 2.0


class HealthService:
    def __init__(
        self,
        checks: Sequence[HealthCheck],
        timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
    ) -> None:
        self._checks = checks
        self._timeout_seconds = timeout_seconds
        # Cancelled checks that are still cleaning up: a strong reference keeps
        # the event loop from garbage-collecting them halfway.
        self._abandoned: set[asyncio.Task[bool]] = set()

    async def check(self) -> HealthReport:
        """Run every check in parallel; each one is cut at the timeout."""
        results = await asyncio.gather(*(self._is_up(c) for c in self._checks))
        optional = {check.name for check in self._checks if not check.critical}
        return HealthReport.from_checks(
            {check.name: up for check, up in zip(self._checks, results, strict=True)},
            optional=optional,
        )

    async def _is_up(self, check: HealthCheck) -> bool:
        """Report a slow or raising check as down so /health survives outages.

        Unlike `asyncio.wait_for`, a check past the timeout is cancelled without
        waiting for it to finish: cleaning up after a hung dependency (closing
        a PostgreSQL connection that no longer answers) can take as long as the
        check itself, and the response must still arrive within the timeout.
        """
        task = asyncio.ensure_future(check.is_up())
        done, _ = await asyncio.wait({task}, timeout=self._timeout_seconds)
        if not done:
            logger.warning(
                "Health check %s timed out after %ss",
                check.name,
                self._timeout_seconds,
            )
            task.cancel()
            self._abandoned.add(task)
            task.add_done_callback(self._forget)
            return False
        try:
            return task.result()
        except Exception:
            logger.exception("Health check %s failed", check.name)
            return False

    def _forget(self, task: asyncio.Task[bool]) -> None:
        self._abandoned.discard(task)
        # Retrieve any cleanup error so asyncio does not log it as unhandled:
        # the check already counted as down.
        _ = task.cancelled() or task.exception()
