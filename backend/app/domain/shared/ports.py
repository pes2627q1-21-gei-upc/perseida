from collections.abc import AsyncIterator
from contextlib import AbstractAsyncContextManager
from typing import Protocol


class Cache(Protocol):
    """Key-value cache with expiration. Keys are ``<domain>:<id>``.

    The adapter owns the storage prefix and the default TTL. It never raises:
    if the backend is unavailable, ``get`` behaves as a miss and ``set`` does
    nothing, so callers fall back to the original source.
    """

    async def get(self, key: str) -> str | None:
        """Return the value stored under ``key``, or ``None`` on a miss."""
        ...

    async def set(self, key: str, value: str, ttl_seconds: int | None = None) -> None:
        """Store ``value`` under ``key``.

        ``ttl_seconds`` overrides the default TTL for this key.
        """
        ...


class PubSub(Protocol):
    """Publish/subscribe bus split by channel."""

    async def publish(self, channel: str, message: str) -> None:
        """Deliver ``message`` to every current subscriber of ``channel``.

        Raises:
            ExternalServiceError: if the bus is unavailable.
        """
        ...

    def subscribe(
        self, channel: str
    ) -> AbstractAsyncContextManager[AsyncIterator[str]]:
        """Subscribe to ``channel`` for the duration of an ``async with`` block.

        The subscription is active once the block is entered; the block yields
        the messages published afterwards. Leaving the block unsubscribes.

        Raises:
            ExternalServiceError: if the bus is unavailable.
        """
        ...
