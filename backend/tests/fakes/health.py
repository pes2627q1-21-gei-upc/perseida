class FakeHealthCheck:
    def __init__(self, name: str, up: bool = True, raises: bool = False) -> None:
        self._name = name
        self._up = up
        self._raises = raises

    @property
    def name(self) -> str:
        return self._name

    async def is_up(self) -> bool:
        if self._raises:
            raise RuntimeError("dependency unavailable")
        return self._up
