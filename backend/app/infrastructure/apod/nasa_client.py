import asyncio
import datetime as dt
from urllib.parse import urlsplit

import httpx
from pydantic import BaseModel, SecretStr, ValidationError

from app.domain.apod.models import Apod, MediaType
from app.domain.shared.errors import DomainError

APOD_URL = "https://api.nasa.gov/planetary/apod"

# Since APOD moved to science.nasa.gov, the API answers every date with its logo
# (https://science.nasa.gov/.../nasa-logo@2x.png) and a generic text (seen on
# 2026-10-21). It is not an APOD and is never stored. Matched by host and file
# name, so another size or path of the logo is not stored for good either
# (``save`` never overwrites a date).
_PLACEHOLDER_HOST = "science.nasa.gov"
_PLACEHOLDER_NAME = "nasa-logo"


def _is_placeholder(url: str) -> bool:
    parsed = urlsplit(url)
    return parsed.hostname == _PLACEHOLDER_HOST and _PLACEHOLDER_NAME in parsed.path


class NasaApodError(Exception):
    """The NASA API failed, timed out or gave no usable APOD.

    Messages never contain the API key: it travels in a header, not in the URL.
    """


class _NasaApod(BaseModel):
    """Fields of the NASA response that Perseida uses; the rest are ignored."""

    date: dt.date
    title: str
    explanation: str
    # NASA also sends "other" (interactive content, no url): it fails here.
    media_type: MediaType
    url: str
    copyright: str | None = None


class NasaApodClient:
    """Calls the NASA APOD API and translates its response into ``Apod``."""

    def __init__(
        self,
        http: httpx.AsyncClient,
        api_key: SecretStr,
        timeout_seconds: float,
        api_url: str = APOD_URL,
    ) -> None:
        self._http = http
        self._api_url = api_url
        self._api_key = api_key
        self._timeout_seconds = timeout_seconds

    async def fetch(self, day: dt.date | None = None) -> Apod:
        """Return the APOD of ``day``, or NASA's latest one when ``day`` is None.

        Raises:
            NasaApodError: on HTTP errors, timeouts (``timeout_seconds`` for the
                whole request) or a response that is not a usable APOD.
        """
        params = {} if day is None else {"date": day.isoformat()}
        try:
            # httpx's timeouts apply to each phase (connect, each read...), so a
            # slow trickle could exceed them; this bounds the whole request.
            async with asyncio.timeout(self._timeout_seconds):
                response = await self._http.get(
                    self._api_url,
                    params=params,
                    headers={"X-Api-Key": self._api_key.get_secret_value()},
                )
            response.raise_for_status()
            nasa = _NasaApod.model_validate_json(response.content)
        except (httpx.HTTPError, TimeoutError) as exc:
            # Only the type: the details stay in ``__cause__``.
            message = f"NASA APOD request failed: {type(exc).__name__}"
            raise NasaApodError(message) from exc
        except ValidationError as exc:
            raise NasaApodError("NASA APOD response is not a usable APOD") from exc
        if _is_placeholder(nasa.url):
            raise NasaApodError("NASA APOD response is the placeholder logo")
        try:
            return Apod(
                apod_date=nasa.date,
                title=nasa.title,
                explanation=nasa.explanation,
                media_type=nasa.media_type,
                media_url=nasa.url,
                # NASA wraps it in spaces and line breaks ("\nJane Doe\n").
                copyright=(nasa.copyright or "").strip() or None,
            )
        except DomainError as exc:
            # E.g. a media URL that is not https (APOD_MEDIA_URL_INVALID).
            raise NasaApodError("NASA APOD response breaks a domain rule") from exc
