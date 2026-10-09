class FakeHealthCheck:
    def __init__(self, name: str, up: bool = True) -> None:
        self._name = name
        self._up = up

    @property
    def name(self) -> str:
        return self._name

    async def is_up(self) -> bool:
        return self._up
