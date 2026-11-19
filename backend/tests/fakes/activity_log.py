import uuid


class FakeActivityLog:
    """Records every ``record`` call; raises ``error`` when one is set."""

    def __init__(self, error: Exception | None = None) -> None:
        self.error = error
        self.records: list[tuple[uuid.UUID, str, int]] = []

    async def record(self, user_id: uuid.UUID, activity: str, value: int) -> None:
        if self.error is not None:
            raise self.error
        self.records.append((user_id, activity, value))
