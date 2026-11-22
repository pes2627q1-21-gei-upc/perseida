"""Spaces from the Spotwise service, ``GET /api/espais/`` (TG-352).

Contract: vault ``arquitectura/contracte-spotwise.md``. The token travels in the
``Authorization`` header and never appears in logs or error messages.
"""

import asyncio
import logging
import time
from collections import deque
from collections.abc import Callable
from typing import Any, Literal

import httpx
from pydantic import BaseModel, SecretStr
from pydantic import ValidationError as PydanticValidationError

from app.application.meeting_points.errors import MEETING_POINTS_UNAVAILABLE
from app.application.shared.errors import ExternalServiceError
from app.domain.meeting_points.models import (
    PlugLevel,
    SessionProfile,
    SilenceLevel,
    Space,
    SpaceType,
)
from app.domain.shared.location import Location

logger = logging.getLogger(__name__)

SPACES_PATH = "/api/espais/"
# Spotwise asks not to exceed 60 requests per minute (contracte-spotwise.md).
# One client per process, and Perseida runs one process (ADR-0003).
MAX_CALLS_PER_WINDOW = 60
WINDOW_SECONDS = 60.0

_TYPES = {
    "biblioteca": SpaceType.LIBRARY,
    "cafeteria": SpaceType.CAFE,
    "altre": SpaceType.OTHER,
}
_SILENCE = {
    "silencios": SilenceLevel.SILENT,
    "murmuri": SilenceLevel.MURMUR,
    "sorollos": SilenceLevel.NOISY,
}
_PLUGS = {
    "molts": PlugLevel.MANY,
    "pocs": PlugLevel.FEW,
    "cap": PlugLevel.NONE,
}
_SILENCE_PARAM = {level: name for name, level in _SILENCE.items()}
_PLUGS_PARAM = {level: name for name, level in _PLUGS.items()}


class _SpotwiseSpace(BaseModel):
    """Fields of a Spotwise space that Perseida reads; the rest are ignored.

    Spotwise always sends every field, ``null`` when it has no value.
    """

    id: int
    nom: str
    tipus: Literal["biblioteca", "cafeteria", "altre"]
    adreca: str
    te_wifi: bool
    latitud: float
    longitud: float
    nivell_silenci: Literal["silencios", "murmuri", "sorollos"] | None
    endolls_disponibles: Literal["molts", "pocs", "cap"] | None
    apte_grup: bool | None
    distancia_m: int | None
    obert_ara: bool | None


def _to_space(record: Any) -> Space | None:
    """Return the space of ``record``, or None (logged) if it is not valid."""
    try:
        space = _SpotwiseSpace.model_validate(record)
        return Space(
            id=space.id,
            name=space.nom,
            type=_TYPES[space.tipus],
            address=space.adreca,
            location=Location(latitude=space.latitud, longitude=space.longitud),
            wifi=space.te_wifi,
            silence=_SILENCE[space.nivell_silenci] if space.nivell_silenci else None,
            plugs=(
                _PLUGS[space.endolls_disponibles] if space.endolls_disponibles else None
            ),
            group_friendly=space.apte_grup,
            distance_m=space.distancia_m,
            open_now=space.obert_ara,
        )
    except PydanticValidationError:
        space_id = record.get("id", "?") if isinstance(record, dict) else "?"
        logger.warning("Discarded invalid Spotwise space %s", space_id)
        return None


def to_spaces(records: list[Any]) -> list[Space]:
    """The valid spaces of a Spotwise answer, in its order."""
    return [space for record in records if (space := _to_space(record))]


def _params(near: Location, profile: SessionProfile) -> httpx.QueryParams:
    params = [("lat", str(near.latitude)), ("lon", str(near.longitude))]
    if profile.group is not None:
        params.append(("grup", "true" if profile.group else "false"))
    params += [("silenci", _SILENCE_PARAM[s]) for s in sorted(profile.silence)]
    params += [("endolls", _PLUGS_PARAM[p]) for p in sorted(profile.plugs)]
    return httpx.QueryParams(tuple(params))


class SpotwiseSpaceClient:
    """Searches the Spotwise spaces near a point for a session profile."""

    def __init__(
        self,
        http: httpx.AsyncClient,
        base_url: str,
        token: SecretStr,
        timeout_seconds: float,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._http = http
        self._url = base_url.rstrip("/") + SPACES_PATH
        self._token = token
        self._timeout_seconds = timeout_seconds
        self._clock = clock
        self._lock = asyncio.Lock()
        self._calls: deque[float] = deque()

    async def search(self, near: Location, profile: SessionProfile) -> list[Space]:
        """Return the Spotwise spaces near ``near``, in its order; invalid ones
        are dropped and logged.

        Raises:
            ExternalServiceError: MEETING_POINTS_UNAVAILABLE on a timeout, a
                connection error, a 4xx/5xx, a body that is not a JSON list, or
                when 60 calls were already made in the last minute (then
                Spotwise is not called).
        """
        await self._take_slot()
        records = await self._get(_params(near, profile))
        return to_spaces(records)

    async def _take_slot(self) -> None:
        """Count a call in the sliding minute, or fail if it is full."""
        async with self._lock:
            now = self._clock()
            while self._calls and self._calls[0] <= now - WINDOW_SECONDS:
                self._calls.popleft()
            if len(self._calls) >= MAX_CALLS_PER_WINDOW:
                raise ExternalServiceError(
                    MEETING_POINTS_UNAVAILABLE, "Spotwise call limit reached"
                )
            self._calls.append(now)

    async def _get(self, params: httpx.QueryParams) -> list[Any]:
        try:
            response = await self._http.get(
                self._url,
                params=params,
                headers={"Authorization": f"Token {self._token.get_secret_value()}"},
                timeout=self._timeout_seconds,
            )
            response.raise_for_status()
            body = response.json()
        except httpx.HTTPStatusError as exc:
            raise ExternalServiceError(
                MEETING_POINTS_UNAVAILABLE,
                f"Spotwise answered {exc.response.status_code}",
            ) from exc
        except httpx.HTTPError as exc:
            raise ExternalServiceError(
                MEETING_POINTS_UNAVAILABLE,
                f"Spotwise failed: {type(exc).__name__}",
            ) from exc
        except ValueError as exc:
            raise ExternalServiceError(
                MEETING_POINTS_UNAVAILABLE, "Spotwise answered no JSON"
            ) from exc
        if not isinstance(body, list):
            raise ExternalServiceError(
                MEETING_POINTS_UNAVAILABLE, "Spotwise answered no JSON list"
            )
        return body
