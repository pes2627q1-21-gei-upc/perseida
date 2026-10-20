from collections.abc import Callable
from datetime import UTC, datetime

import jwt
from pydantic import ValidationError

from app.application.auth.errors import INVALID_SESSION
from app.application.shared.errors import UnauthorizedError
from app.domain.auth.models import SessionClaims

ALGORITHM = "HS256"
REQUIRED_CLAIMS = ["sub", "jti", "type", "iat", "exp"]


def _utc_now() -> datetime:
    return datetime.now(UTC)


class JwtTokenCodec:
    """``TokenCodec`` that signs our session tokens as JWTs (HS256)."""

    def __init__(self, secret: str, now: Callable[[], datetime] = _utc_now) -> None:
        self._secret = secret
        self._now = now

    def encode(self, claims: SessionClaims) -> str:
        payload = {
            "sub": claims.sub,
            "jti": claims.jti,
            "type": claims.type.value,
            "iat": self._now(),
            "exp": claims.exp,
        }
        return jwt.encode(payload, self._secret, algorithm=ALGORITHM)

    def decode(self, token: str) -> SessionClaims:
        # ``algorithms`` is always explicit: the token must not pick its own.
        try:
            payload = jwt.decode(
                token,
                self._secret,
                algorithms=[ALGORITHM],
                options={"require": REQUIRED_CLAIMS},
            )
            return SessionClaims.model_validate(
                {key: payload[key] for key in ("sub", "jti", "type", "exp")}
            )
        except jwt.InvalidTokenError, ValidationError:
            raise UnauthorizedError(INVALID_SESSION) from None
