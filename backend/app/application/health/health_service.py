import logging
from collections.abc import Sequence

from app.domain.health.models import HealthReport
from app.domain.health.ports import HealthCheck

logger = logging.getLogger(__name__)


class HealthService:
    def __init__(self, checks: Sequence[HealthCheck]) -> None:
        self._checks = checks

    async def check(self) -> HealthReport:
        results = {check.name: await self._is_up(check) for check in self._checks}
        return HealthReport.from_checks(results)

    @staticmethod
    async def _is_up(check: HealthCheck) -> bool:
        """Report a raising check as down so /health survives outages."""
        try:
            return await check.is_up()
        except Exception:
            logger.exception("Health check %s failed", check.name)
            return False
