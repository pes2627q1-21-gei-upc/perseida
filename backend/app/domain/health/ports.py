from typing import Protocol


class HealthCheck(Protocol):
    @property
    def name(self) -> str:
        """Component name reported in the health report."""
        ...

    @property
    def critical(self) -> bool:
        """Whether the component is critical: if it is down, the overall status is down.

        A non-critical component is still reported, but its outage keeps the
        overall status ok.
        """
        ...

    async def is_up(self) -> bool:
        """Return whether the component is up.

        Never raises: any failure is reported as False.
        """
        ...
