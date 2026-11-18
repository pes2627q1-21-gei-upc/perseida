from collections.abc import Collection
from enum import StrEnum
from typing import Self

from pydantic import BaseModel, ConfigDict


class HealthStatus(StrEnum):
    OK = "ok"
    DOWN = "down"


class HealthReport(BaseModel):
    model_config = ConfigDict(frozen=True)

    status: HealthStatus
    components: dict[str, HealthStatus]

    @classmethod
    def from_checks(
        cls, checks: dict[str, bool], optional: Collection[str] = ()
    ) -> Self:
        """Build a report with every component.

        The overall status is down only if a component that is not in
        ``optional`` is down.
        """
        components = {
            name: HealthStatus.OK if is_up else HealthStatus.DOWN
            for name, is_up in checks.items()
        }
        critical_up = all(
            is_up for name, is_up in checks.items() if name not in optional
        )
        overall = HealthStatus.OK if critical_up else HealthStatus.DOWN
        return cls(status=overall, components=components)
