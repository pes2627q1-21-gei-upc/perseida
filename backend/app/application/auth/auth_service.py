from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from app.application.auth.errors import (
    ACCOUNT_DELETED,
    ACCOUNT_SUSPENDED,
    INVALID_SESSION,
)
from app.application.shared.errors import ForbiddenError, UnauthorizedError
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
        return await self._issue_pair(identity.google_sub)

    async def refresh(self, refresh_token: str) -> SessionTokens:
        """Exchange a refresh token for a new pair; the old refresh is revoked.

        Raises:
            UnauthorizedError: INVALID_SESSION if the token is invalid, expired,
                not a refresh token or already used/revoked.
            ExternalServiceError: if the session store is unavailable.
        """
        claims = await self._validate(refresh_token, TokenType.REFRESH)
        await self._store.delete(TokenType.REFRESH, claims.jti)
        return await self._issue_pair(claims.sub)

    async def authenticate(self, access_token: str) -> SessionClaims:
        """Return the claims of a valid, non-revoked access token.

        Raises:
            UnauthorizedError: INVALID_SESSION if the token is invalid, expired,
                not an access token or revoked.
            ExternalServiceError: if the session store is unavailable.
        """
        return await self._validate(access_token, TokenType.ACCESS)

    @staticmethod
    def _ensure_can_log_in(status: AccountStatus) -> None:
        match status:
            case AccountStatus.ACTIVE:
                return
            case AccountStatus.SUSPENDED | AccountStatus.BANNED:
                raise ForbiddenError(ACCOUNT_SUSPENDED)
            case AccountStatus.DELETED:
                raise ForbiddenError(ACCOUNT_DELETED)

    async def _validate(self, token: str, kind: TokenType) -> SessionClaims:
        claims = self._codec.decode(token)
        if claims.type != kind or not await self._store.exists(kind, claims.jti):
            raise UnauthorizedError(INVALID_SESSION)
        return claims

    async def _issue_pair(self, sub: str) -> SessionTokens:
        access = await self._issue(
            sub, TokenType.ACCESS, self._durations.access_seconds
        )
        refresh = await self._issue(
            sub, TokenType.REFRESH, self._durations.refresh_seconds
        )
        return SessionTokens(
            access_token=access,
            refresh_token=refresh,
            expires_in=self._durations.access_seconds,
        )

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
