"""Fakes for the real-time session (US #63): a scripted WebSocket and a flaky store."""

import asyncio
import json
from collections.abc import Callable
from typing import Any

from app.application.shared.errors import ExternalServiceError
from app.domain.auth.models import TokenType
from app.domain.realtime.ports import ConnectionClosed
from tests.fakes.auth import InMemorySessionStore

SAFETY_TIMEOUT = 1.0
_POLL_SECONDS = 0.005
_CLOSED = None  # sentinel put in the inbox to wake a pending ``receive_text``


async def wait_until(
    predicate: Callable[[], bool], timeout: float = SAFETY_TIMEOUT
) -> None:
    """Poll ``predicate`` until true; the timeout is only a safety net."""

    async def _poll() -> None:
        while not predicate():
            await asyncio.sleep(_POLL_SECONDS)

    try:
        await asyncio.wait_for(_poll(), timeout)
    except TimeoutError:
        raise AssertionError("condition not met before the safety timeout") from None


class FakeConnection:
    """Server side of a WebSocket the test drives as if it were the client."""

    def __init__(self, auto_pong: bool = False) -> None:
        self._inbox: asyncio.Queue[str | None] = asyncio.Queue()
        self._disconnected = False
        self.sent: list[str] = []
        self.closed_code: int | None = None
        self.auto_pong = auto_pong
        self._sends_blocked = False

    # client -> server
    def feed(self, text: str) -> None:
        self._inbox.put_nowait(text)

    def feed_frame(self, frame: dict[str, Any]) -> None:
        self.feed(json.dumps(frame))

    def block_sends(self) -> None:
        """The client stops reading: ``send_text`` waits forever from now on."""
        self._sends_blocked = True

    def disconnect(self) -> None:
        """The client goes away: the next ``receive_text`` raises."""
        self._disconnected = True
        self._inbox.put_nowait(_CLOSED)

    # server side, what RealtimeConnection exposes
    async def receive_text(self) -> str:
        if self._disconnected or self.closed_code is not None:
            raise ConnectionClosed
        item = await self._inbox.get()
        if item is _CLOSED:
            self._inbox.put_nowait(_CLOSED)  # keep raising on later calls
            raise ConnectionClosed
        return item

    async def send_text(self, data: str) -> None:
        if self._disconnected or self.closed_code is not None:
            raise ConnectionClosed
        if self._sends_blocked:
            await asyncio.Event().wait()  # never set: only cancellation ends it
        self.sent.append(data)
        if self.auto_pong:
            frame = json.loads(data)
            if frame.get("type") == "ping":
                self.feed_frame({"type": "pong", "id": frame.get("id")})

    async def close(self, code: int) -> None:
        if self.closed_code is None:
            self.closed_code = code
        self._inbox.put_nowait(_CLOSED)

    # helpers for the test
    def sent_frames(self) -> list[dict[str, Any]]:
        return [json.loads(text) for text in self.sent]

    async def wait_for_sent(self, count: int, timeout: float = SAFETY_TIMEOUT) -> None:
        await wait_until(lambda: len(self.sent) >= count, timeout)

    async def wait_closed(self, timeout: float = SAFETY_TIMEOUT) -> int:
        await wait_until(lambda: self.closed_code is not None, timeout)
        assert self.closed_code is not None
        return self.closed_code


class FlakySessionStore(InMemorySessionStore):
    """In-memory store whose ``exists`` can be made to fail like a Redis outage."""

    def __init__(self) -> None:
        super().__init__()
        self.failing = False

    async def exists(self, kind: TokenType, jti: str) -> bool:
        if self.failing:
            raise ExternalServiceError("SESSION_UNAVAILABLE")
        return await super().exists(kind, jti)
