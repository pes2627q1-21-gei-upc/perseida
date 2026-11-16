"""In-memory PubSub for the real-time tests (US #63)."""

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from app.application.shared.errors import ExternalServiceError

PUBSUB_UNAVAILABLE = "PUBSUB_UNAVAILABLE"


class _Broken:
    """Sentinel queued to make an active iterator raise."""


class FakePubSub:
    """Implements the ``PubSub`` port; delivers to the current subscribers only."""

    def __init__(self) -> None:
        self._queues: dict[str, list[asyncio.Queue[str | _Broken]]] = {}
        self._failure: Exception | None = None
        self.published: list[tuple[str, str]] = []

    def fail(self, failing: bool = True, error: Exception | None = None) -> None:
        """Make publish and subscribe raise (``PUBSUB_UNAVAILABLE`` by default)."""
        self._failure = (
            (error or ExternalServiceError(PUBSUB_UNAVAILABLE)) if failing else None
        )

    def break_subscriptions(self) -> None:
        """Make every active subscription iterator raise ``ExternalServiceError``."""
        for queues in self._queues.values():
            for queue in queues:
                queue.put_nowait(_Broken())

    def subscriber_count(self, channel: str) -> int:
        return len(self._queues.get(channel, []))

    def active_channels(self) -> list[str]:
        return [name for name, queues in self._queues.items() if queues]

    async def publish(self, channel: str, message: str) -> None:
        if self._failure is not None:
            raise self._failure
        self.published.append((channel, message))
        for queue in list(self._queues.get(channel, [])):
            queue.put_nowait(message)

    @asynccontextmanager
    async def subscribe(self, channel: str) -> AsyncIterator[AsyncIterator[str]]:
        if self._failure is not None:
            raise self._failure
        queue: asyncio.Queue[str | _Broken] = asyncio.Queue()
        self._queues.setdefault(channel, []).append(queue)

        async def messages() -> AsyncIterator[str]:
            while True:
                item = await queue.get()
                if isinstance(item, _Broken):
                    raise ExternalServiceError(PUBSUB_UNAVAILABLE)
                yield item

        try:
            yield messages()
        finally:
            self._queues[channel].remove(queue)
