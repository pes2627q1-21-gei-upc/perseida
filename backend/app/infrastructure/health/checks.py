class ApplicationCheck:
    """Liveness of the application process itself."""

    @property
    def name(self) -> str:
        return "app"

    async def is_up(self) -> bool:
        return True
