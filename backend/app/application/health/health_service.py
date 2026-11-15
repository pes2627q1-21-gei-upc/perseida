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

    async def check(self) -> HealthReport:
        """Run every check in parallel; each one is cut at the timeout."""
        results = await asyncio.gather(*(self._is_up(c) for c in self._checks))
        optional = {check.name for check in self._checks if not check.critical}
        return HealthReport.from_checks(
            {check.name: up for check, up in zip(self._checks, results, strict=True)},
            optional=optional,
        )

    async def _is_up(self, check: HealthCheck) -> bool:
        """Report a slow or raising check as down so /health survives outages."""
        try:
            return await asyncio.wait_for(check.is_up(), self._timeout_seconds)
        except TimeoutError:
            logger.warning(
                "Health check %s timed out after %ss",
                check.name,
                self._timeout_seconds,
            )
            return False
        except Exception:
            logger.exception("Health check %s failed", check.name)
            return False
