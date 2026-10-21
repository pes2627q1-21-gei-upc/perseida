import asyncio
import datetime as dt

import httpx
from pydantic import BaseModel, SecretStr, ValidationError

from app.domain.apod.models import Apod, MediaType

APOD_URL = "https://api.nasa.gov/planetary/apod"

# Since APOD moved to science.nasa.gov, the API answers every date with this logo
# and a generic text (seen on 2026-10-21). It is not an APOD and is never stored.
PLACEHOLDER_MEDIA_URL = (
    "https://science.nasa.gov/wp-content/themes/nasa-child/assets/images/"
    "nasa-logo@2x.png"
)


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
        self, http: httpx.AsyncClient, api_key: SecretStr, timeout_seconds: float
    ) -> None:
        self._http = http
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
            async with asyncio.timeout(self._timeout_seconds):
                response = await self._http.get(
                    APOD_URL,
                    params=params,
                    headers={"X-Api-Key": self._api_key.get_secret_value()},
                )
            response.raise_for_status()
            nasa = _NasaApod.model_validate_json(response.content)
        except (httpx.HTTPError, TimeoutError) as exc:
            raise NasaApodError(f"NASA APOD request failed: {exc!r}") from exc
        except ValidationError as exc:
            raise NasaApodError("NASA APOD response is not a usable APOD") from exc
        if nasa.url == PLACEHOLDER_MEDIA_URL:
            raise NasaApodError("NASA APOD response is the placeholder logo")
        return Apod(
            apod_date=nasa.date,
            title=nasa.title,
            explanation=nasa.explanation,
            media_type=nasa.media_type,
            media_url=nasa.url,
            # NASA wraps it in spaces and line breaks ("\nJane Doe\n").
            copyright=(nasa.copyright or "").strip() or None,
        )
