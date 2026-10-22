import logging
import time
from collections.abc import Callable
from typing import Any

import httpx
import jwt
from pydantic import ValidationError

from app.application.auth.errors import (
    IDENTITY_PROVIDER_UNAVAILABLE,
    INVALID_GOOGLE_TOKEN,
)
from app.application.shared.errors import ExternalServiceError, UnauthorizedError
from app.domain.auth.models import GoogleIdentity

logger = logging.getLogger(__name__)

GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs"
GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"]
ALGORITHM = "RS256"
REQUIRED_CLAIMS = ["exp", "iss", "aud", "sub"]
KEYS_TTL_SECONDS = 3600
# Minimum time between two downloads, so unknown ``kid``s cannot make us hammer Google.
MIN_REFRESH_INTERVAL_SECONDS = 60


class GoogleJwksVerifier:
    """``GoogleTokenVerifier`` that checks Google ID tokens against Google's JWKS."""

    def __init__(
        self,
        client: httpx.AsyncClient,
        google_client_id: str,
        monotonic: Callable[[], float] = time.monotonic,
    ) -> None:
        self._client = client
        self._google_client_id = google_client_id
        self._monotonic = monotonic
        self._keys: dict[str, jwt.PyJWK] = {}
        self._fetched_at = 0.0
        self._last_attempt = 0.0

    async def verify(self, id_token: str) -> GoogleIdentity:
        try:
            kid = jwt.get_unverified_header(id_token).get("kid")
        except jwt.PyJWTError:
            raise UnauthorizedError(INVALID_GOOGLE_TOKEN) from None
        if not isinstance(kid, str):
            raise UnauthorizedError(INVALID_GOOGLE_TOKEN)
        key = await self._key_for(kid)
        try:
            payload = jwt.decode(
                id_token,
                key,
                algorithms=[ALGORITHM],
                audience=self._google_client_id,
                issuer=GOOGLE_ISSUERS,
                options={"require": REQUIRED_CLAIMS},
            )
            if payload.get("email_verified") is not True:
                raise UnauthorizedError(INVALID_GOOGLE_TOKEN)
            return GoogleIdentity(
                google_sub=payload["sub"],
                email=payload["email"],
                name=payload.get("name"),
                picture=payload.get("picture"),
            )
        except jwt.PyJWTError, KeyError, ValidationError:
            raise UnauthorizedError(INVALID_GOOGLE_TOKEN) from None

    async def _key_for(self, kid: str) -> jwt.PyJWK:
        now = self._monotonic()
        expired = now - self._fetched_at >= KEYS_TTL_SECONDS
        may_download = (
            not self._keys or now - self._last_attempt >= MIN_REFRESH_INTERVAL_SECONDS
        )
        if (not self._keys or expired or kid not in self._keys) and may_download:
            await self._download_keys(now)
        key = self._keys.get(kid)
        if key is None:
            raise UnauthorizedError(INVALID_GOOGLE_TOKEN)
        return key

    async def _download_keys(self, now: float) -> None:
        """Replace the cached keys; keep the old ones if Google fails."""
        self._last_attempt = now
        try:
            response = await self._client.get(GOOGLE_CERTS_URL)
            response.raise_for_status()
            keys = _parse_keys(response.json())
        except httpx.HTTPError, ValueError, jwt.PyJWTError:
            logger.warning("Could not download Google's public keys", exc_info=True)
            if not self._keys:
                raise ExternalServiceError(IDENTITY_PROVIDER_UNAVAILABLE) from None
            return
        self._keys = keys
        self._fetched_at = now


def _parse_keys(data: Any) -> dict[str, jwt.PyJWK]:
    keys = {key.key_id: key for key in jwt.PyJWKSet.from_dict(data).keys if key.key_id}
    if not keys:
        raise ValueError("the JWKS has no usable keys")
    return keys
