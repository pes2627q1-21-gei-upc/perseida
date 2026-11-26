"""Port for direct-message handling on an authenticated realtime session."""

import uuid
from typing import Any, Protocol


class DirectHandler(Protocol):
    async def user_id(self, sub: str) -> uuid.UUID: ...

    async def send(
        self, sub: str, connection_id: str, payload: dict[str, Any]
    ) -> dict[str, Any]: ...

    async def typing(self, sub: str, payload: dict[str, Any]) -> None: ...
