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
    ) -> None:
        self._name = name
        self._up = up
        self._raises = raises
        self._critical = critical
        self._delay = delay

    @property
    def name(self) -> str:
        return self._name

    @property
    def critical(self) -> bool:
        return self._critical

    async def is_up(self) -> bool:
        if self._delay:
            await asyncio.sleep(self._delay)
        if self._raises:
            raise RuntimeError("dependency unavailable")
        return self._up
