class FakeCache:
    """In-memory ``Cache``. ``expire`` simulates the TTL running out."""

    def __init__(self) -> None:
        self.values: dict[str, str] = {}
        self.ttls: dict[str, int | None] = {}

    async def get(self, key: str) -> str | None:
        return self.values.get(key)

    async def set(self, key: str, value: str, ttl_seconds: int | None = None) -> None:
        self.values[key] = value
        self.ttls[key] = ttl_seconds

    def expire(self, key: str) -> None:
        self.values.pop(key, None)
        self.ttls.pop(key, None)
