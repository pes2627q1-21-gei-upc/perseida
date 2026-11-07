import asyncio
import json
import logging
from collections.abc import Awaitable, Callable, Coroutine
from contextlib import suppress
from dataclasses import dataclass
from typing import Any
from uuid import uuid4

from app.application.auth.auth_service import AuthService
from app.application.realtime import errors
from app.application.realtime.errors import error_frame
from app.application.shared.errors import ExternalServiceError, UnauthorizedError
from app.domain.auth.models import SessionClaims, TokenType
from app.domain.auth.ports import SessionStore
from app.domain.realtime.models import (
    Frame,
    FrameType,
    revocation_channel,
    room_channel,
)
from app.domain.realtime.ports import ConnectionClosed, RealtimeConnection
from app.domain.shared.ports import PubSub

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class RealtimeConfig:
    auth_timeout_seconds: float
    heartbeat_seconds: float


class _BadFrameError(Exception):
    def __init__(self, code: str, detail: str, frame_id: str | None = None) -> None:
        self.reply = error_frame(code, detail, frame_id)
        super().__init__(code)


class RealtimeSession:
    """One authenticated WebSocket connection: frames in, pub/sub fan-out out.

    ``run`` never raises: every failure ends in a close code. The first frame
    carries the access token, which is never logged.
    """

    def __init__(
        self,
        conn: RealtimeConnection,
        auth: AuthService,
        store: SessionStore,
        pubsub: PubSub,
        config: RealtimeConfig,
        conn_id: str,
    ) -> None:
        self._conn = conn
        self._auth = auth
        self._store = store
        self._pubsub = pubsub
        self._config = config
        self._conn_id = conn_id
        self._send_lock = asyncio.Lock()
        self._close_code: int | None = None
        self._pong_pending = False
        self._rooms: dict[str, asyncio.Task[None]] = {}
        self._tasks: list[asyncio.Task[None]] = []

    async def run(self) -> None:
        try:
            claims = await self._authenticate()
            if claims is not None:
                await self._serve(claims)
        except ConnectionClosed:
            pass
        except Exception as exc:
            await self._fail(exc)
        finally:
            await self._stop_tasks()

    # --- handshake ---------------------------------------------------------

    async def _authenticate(self) -> SessionClaims | None:
        token = await self._first_frame_token()
        if token is None:
            await self._close(errors.CLOSE_UNAUTHENTICATED)
            return None
        try:
            return await self._auth.authenticate(token)
        except UnauthorizedError:
            await self._close(errors.CLOSE_UNAUTHENTICATED)
            return None

    async def _first_frame_token(self) -> str | None:
        try:
            async with asyncio.timeout(self._config.auth_timeout_seconds):
                raw = await self._conn.receive_text()
        except TimeoutError:
            return None
        try:
            data = json.loads(raw)
        except ValueError:
            return None
        if not isinstance(data, dict) or data.get("type") != FrameType.AUTH:
            return None
        token = data.get("token")
        return token if isinstance(token, str) else None

    async def _serve(self, claims: SessionClaims) -> None:
        await self._start_subscription(
            revocation_channel(claims.sub),
            lambda raw: self._on_revocation(raw, claims),
        )
        self._spawn(self._heartbeat(claims))
        await self._send(Frame(type=FrameType.AUTH))
        while True:
            await self._handle(await self._conn.receive_text())

    # --- inbound frames ----------------------------------------------------

    async def _handle(self, raw: str) -> None:
        try:
            frame = self._parse(raw)
        except _BadFrameError as bad:
            await self._send(bad.reply)
        else:
            await self._dispatch(frame)

    @staticmethod
    def _parse(raw: str) -> Frame:
        try:
            data = json.loads(raw)
        except ValueError:
            raise _BadFrameError(
                errors.VALIDATION_ERROR, "Frame is not valid JSON."
            ) from None
        if not isinstance(data, dict):
            raise _BadFrameError(errors.VALIDATION_ERROR, "Frame must be an object.")
        frame_id = data.get("id") if isinstance(data.get("id"), str) else None
        kind = data.get("type")
        if isinstance(kind, str) and kind not in set(FrameType):
            raise _BadFrameError(
                errors.UNKNOWN_FRAME_TYPE, "Unknown frame type.", frame_id
            )
        try:
            return Frame.model_validate(data)
        except ValueError:
            raise _BadFrameError(
                errors.VALIDATION_ERROR, "Invalid frame.", frame_id
            ) from None

    async def _dispatch(self, frame: Frame) -> None:
        match frame.type:
            case FrameType.PING:
                await self._send(Frame(type=FrameType.PONG, id=frame.id))
            case FrameType.PONG:
                self._pong_pending = False
            case FrameType.SUBSCRIBE | FrameType.UNSUBSCRIBE | FrameType.MESSAGE:
                await self._room_frame(frame)
            case _:
                await self._send(
                    error_frame(
                        errors.VALIDATION_ERROR,
                        "Frame not allowed at this point.",
                        frame.id,
                    )
                )

    async def _room_frame(self, frame: Frame) -> None:
        if frame.room is None:
            reply = error_frame(
                errors.VALIDATION_ERROR, "The frame needs a room.", frame.id
            )
        else:
            try:
                reply = await self._room_action(frame, frame.room)
            except ExternalServiceError:
                reply = error_frame(
                    errors.PUBSUB_UNAVAILABLE,
                    "Real-time bus unavailable.",
                    frame.id,
                    frame.room,
                )
        await self._send(reply)

    async def _room_action(self, frame: Frame, room: str) -> Frame:
        if frame.type == FrameType.SUBSCRIBE:
            await self._join(room)
        elif frame.type == FrameType.UNSUBSCRIBE:
            await self._leave(room)
        elif room not in self._rooms:
            return error_frame(
                errors.NOT_SUBSCRIBED, "Subscribe to the room first.", frame.id, room
            )
        else:
            envelope = {
                "from": self._conn_id,
                "frame": frame.model_dump(mode="json", exclude_none=True),
            }
            await self._pubsub.publish(room_channel(room), json.dumps(envelope))
        return Frame(type=frame.type, room=room, id=frame.id)

    # --- subscriptions -----------------------------------------------------

    async def _join(self, room: str) -> None:
        if room not in self._rooms:
            self._rooms[room] = await self._start_subscription(
                room_channel(room), self._on_room_message
            )

    async def _leave(self, room: str) -> None:
        task = self._rooms.pop(room, None)
        if task is not None:
            await self._cancel(task)

    async def _start_subscription(
        self, channel: str, handler: Callable[[str], Awaitable[None]]
    ) -> asyncio.Task[None]:
        """Subscribe in a task; return once the subscription is active."""
        ready: asyncio.Future[None] = asyncio.get_running_loop().create_future()
        task = self._spawn(self._listen(channel, handler, ready))
        await ready
        return task

    async def _listen(
        self,
        channel: str,
        handler: Callable[[str], Awaitable[None]],
        ready: asyncio.Future[None],
    ) -> None:
        try:
            async with self._pubsub.subscribe(channel) as messages:
                ready.set_result(None)
                async for raw in messages:
                    await handler(raw)
        except Exception as exc:
            if ready.done():
                raise
            ready.set_exception(exc)

    async def _on_room_message(self, raw: str) -> None:
        try:
            data = json.loads(raw)
            if data["from"] == self._conn_id:
                return
            frame = Frame.model_validate(data["frame"])
        except ValueError, KeyError, TypeError:
            return
        await self._send(frame)

    async def _on_revocation(self, raw: str, claims: SessionClaims) -> None:
        try:
            data = json.loads(raw)
        except ValueError:
            return
        if isinstance(data, dict) and data.get("sid", claims.sid) in (
            None,
            claims.sid,
        ):
            await self._close(errors.CLOSE_UNAUTHENTICATED)

    # --- heartbeat ---------------------------------------------------------

    async def _heartbeat(self, claims: SessionClaims) -> None:
        while True:
            await asyncio.sleep(self._config.heartbeat_seconds)
            if self._pong_pending:
                await self._close(errors.CLOSE_GOING_AWAY)
                return
            try:
                valid = await self._store.exists(TokenType.ACCESS, claims.jti)
            except ExternalServiceError:
                await self._close(errors.CLOSE_TRY_AGAIN_LATER)
                return
            if not valid:
                await self._close(errors.CLOSE_UNAUTHENTICATED)
                return
            self._pong_pending = True
            await self._send(Frame(type=FrameType.PING, id=str(uuid4())))

    # --- plumbing ----------------------------------------------------------

    async def _send(self, frame: Frame) -> None:
        async with self._send_lock:
            await self._conn.send_text(frame.model_dump_json(exclude_none=True))

    async def _close(self, code: int) -> None:
        if self._close_code is None:
            self._close_code = code
            await self._conn.close(code)

    async def _fail(self, exc: Exception) -> None:
        if isinstance(exc, ExternalServiceError):
            await self._close(errors.CLOSE_TRY_AGAIN_LATER)
            return
        logger.error("Unexpected error in a real-time session.", exc_info=exc)
        await self._close(errors.CLOSE_INTERNAL_ERROR)

    def _spawn(self, coro: Coroutine[Any, Any, None]) -> asyncio.Task[None]:
        task = asyncio.create_task(self._supervised(coro))
        self._tasks.append(task)
        return task

    async def _supervised(self, coro: Coroutine[Any, Any, None]) -> None:
        try:
            await coro
        except ConnectionClosed:
            pass
        except Exception as exc:
            await self._fail(exc)

    @staticmethod
    async def _cancel(task: asyncio.Task[None]) -> None:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task

    async def _stop_tasks(self) -> None:
        for task in self._tasks:
            task.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)
