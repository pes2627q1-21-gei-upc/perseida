from typing import Protocol


class HealthCheck(Protocol):
    @property
    def name(self) -> str:
        """Component name reported in the health report."""
        ...

    async def is_up(self) -> bool:
        """Return whether the component is up.

        Never raises: any failure is reported as False.
        """
        ...
