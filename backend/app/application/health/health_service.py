from collections.abc import Sequence

from app.domain.health.models import HealthReport
from app.domain.health.ports import HealthCheck


class HealthService:
    def __init__(self, checks: Sequence[HealthCheck]) -> None:
        self._checks = checks

    async def check(self) -> HealthReport:
        results = {check.name: await check.is_up() for check in self._checks}
        return HealthReport.from_checks(results)
