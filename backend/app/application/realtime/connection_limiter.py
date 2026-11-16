class ConnectionLimiter:
    """Caps the simultaneous WebSocket connections of each user.

    Every connection costs Redis connections (one pub/sub per room plus one for
    revocation), so an unbounded user could exhaust Redis' ``maxclients`` and
    take the sessions down with it (ADR-0008, ADR-0030). The API runs as a single
    process (ADR-0003), so an in-memory counter is enough.

    Methods are synchronous and never await, so they are atomic on the event loop.
    """

    def __init__(self, max_per_user: int) -> None:
        if max_per_user < 1:
            raise ValueError("max_per_user must be at least 1")
        self._max_per_user = max_per_user
        self._active: dict[str, int] = {}

    @property
    def active_users(self) -> int:
        return len(self._active)

    def try_acquire(self, sub: str) -> bool:
        """Take a slot for ``sub``; ``False`` when the user is at the limit."""
        count = self._active.get(sub, 0)
        if count >= self._max_per_user:
            return False
        self._active[sub] = count + 1
        return True

    def release(self, sub: str) -> None:
        """Give a slot back; releasing a user without slots does nothing."""
        count = self._active.get(sub, 0)
        if count <= 1:
            self._active.pop(sub, None)
        else:
            self._active[sub] = count - 1
