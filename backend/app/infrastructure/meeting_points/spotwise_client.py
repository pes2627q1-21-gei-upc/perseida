"""Spaces from the Spotwise service, ``GET /api/espais/`` (TG-352).

Contract: vault ``arquitectura/contracte-spotwise.md``. The token travels in the
``Authorization`` header and never appears in logs or error messages.
"""

import logging
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
    ) -> None:
        self._http = http
        self._url = base_url.rstrip("/") + SPACES_PATH
        self._token = token
        self._timeout_seconds = timeout_seconds

    async def search(self, near: Location, profile: SessionProfile) -> list[Space]:
        """Return the Spotwise spaces near ``near``, in its order; invalid ones
        are dropped and logged.

        Raises:
            ExternalServiceError: MEETING_POINTS_UNAVAILABLE on a timeout, a
                connection error, a 4xx/5xx or a body that is not a JSON list.
        """
        records = await self._get(_params(near, profile))
        return to_spaces(records)

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
