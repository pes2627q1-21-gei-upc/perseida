import asyncio


class FakeHealthCheck:
    def __init__(
        self,
        name: str,
        up: bool = True,
        raises: bool = False,
        *,
        critical: bool = True,
        delay: float = 0,
        cancel_cleanup: float = 0,
    ) -> None:
        self._name = name
        self._up = up
        self._raises = raises
        self._critical = critical
        self._delay = delay
        # Seconds the check takes to clean up once cancelled, like closing a
        # connection to a database that no longer answers.
        self._cancel_cleanup = cancel_cleanup
        self.cleaned_up = False

    @property
    def name(self) -> str:
        return self._name

    @property
    def critical(self) -> bool:
        return self._critical

    async def is_up(self) -> bool:
        if self._delay:
            try:
                await asyncio.sleep(self._delay)
            except asyncio.CancelledError:
                await asyncio.sleep(self._cancel_cleanup)
                self.cleaned_up = True
                raise
        if self._raises:
            raise RuntimeError("dependency unavailable")
        return self._up
