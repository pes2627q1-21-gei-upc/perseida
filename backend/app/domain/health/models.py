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
    def from_checks(cls, checks: dict[str, bool]) -> Self:
        """Build a report; the overall status is ok only if every component is up."""
        components = {
            name: HealthStatus.OK if is_up else HealthStatus.DOWN
            for name, is_up in checks.items()
        }
        overall = HealthStatus.OK if all(checks.values()) else HealthStatus.DOWN
        return cls(status=overall, components=components)
