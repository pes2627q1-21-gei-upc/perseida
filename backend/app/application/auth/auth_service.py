from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from app.application.auth.errors import ACCOUNT_DELETED, ACCOUNT_SUSPENDED
from app.application.shared.errors import ForbiddenError
from app.domain.auth.models import (
    AccountStatus,
    SessionClaims,
    SessionTokens,
    TokenType,
)
from app.domain.auth.ports import (
    AccountGateway,
    GoogleTokenVerifier,
    SessionStore,
    TokenCodec,
)


def _utc_now() -> datetime:
    return datetime.now(UTC)


@dataclass(frozen=True)
class SessionDurations:
    access_seconds: int
    refresh_seconds: int


class AuthService:
    def __init__(
        self,
        verifier: GoogleTokenVerifier,
        codec: TokenCodec,
        store: SessionStore,
        accounts: AccountGateway,
        durations: SessionDurations,
        now: Callable[[], datetime] = _utc_now,
    ) -> None:
        self._verifier = verifier
        self._codec = codec
        self._store = store
        self._accounts = accounts
        self._durations = durations
        self._now = now

    async def login(self, id_token: str) -> SessionTokens:
        """Exchange a Google ID token for our own access and refresh tokens.

        Raises:
            UnauthorizedError: INVALID_GOOGLE_TOKEN (from the verifier).
            ExternalServiceError: IDENTITY_PROVIDER_UNAVAILABLE (from the verifier)
                or the session store unavailable.
            ForbiddenError: ACCOUNT_SUSPENDED (suspended or banned account) or
                ACCOUNT_DELETED.
        """
        identity = await self._verifier.verify(id_token)
        self._ensure_can_log_in(await self._accounts.get_status(identity))
        access = await self._issue(
            identity.google_sub, TokenType.ACCESS, self._durations.access_seconds
        )
        refresh = await self._issue(
            identity.google_sub, TokenType.REFRESH, self._durations.refresh_seconds
        )
        return SessionTokens(
            access_token=access,
            refresh_token=refresh,
            expires_in=self._durations.access_seconds,
        )

    @staticmethod
    def _ensure_can_log_in(status: AccountStatus) -> None:
        match status:
            case AccountStatus.ACTIVE:
                return
            case AccountStatus.SUSPENDED | AccountStatus.BANNED:
                raise ForbiddenError(ACCOUNT_SUSPENDED)
            case AccountStatus.DELETED:
                raise ForbiddenError(ACCOUNT_DELETED)

    async def _issue(self, sub: str, kind: TokenType, ttl_seconds: int) -> str:
        """Encode a new token and register it in the store for its lifetime."""
        jti = str(uuid4())
        claims = SessionClaims(
            sub=sub,
            jti=jti,
            type=kind,
            exp=self._now() + timedelta(seconds=ttl_seconds),
        )
        token = self._codec.encode(claims)
        await self._store.save(kind, jti, ttl_seconds)
        return token
