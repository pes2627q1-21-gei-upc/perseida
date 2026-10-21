from app.application.auth.errors import INVALID_SESSION
from app.application.shared.errors import UnauthorizedError
from app.domain.auth.models import (
    AccountStatus,
    GoogleIdentity,
    SessionClaims,
    TokenType,
)


class FakeGoogleTokenVerifier:
    """Returns a fixed identity, or raises ``failure``. Records the tokens it saw."""

    def __init__(
        self, identity: GoogleIdentity, failure: Exception | None = None
    ) -> None:
        self._identity = identity
        self._failure = failure
        self.verified: list[str] = []

    async def verify(self, id_token: str) -> GoogleIdentity:
        self.verified.append(id_token)
        if self._failure is not None:
            raise self._failure
        return self._identity


class FakeAccountGateway:
    """Returns a fixed status. Records the identities it was asked about."""

    def __init__(self, status: AccountStatus = AccountStatus.ACTIVE) -> None:
        self._status = status
        self.asked: list[GoogleIdentity] = []

    async def get_status(self, identity: GoogleIdentity) -> AccountStatus:
        self.asked.append(identity)
        return self._status


class InMemorySessionStore:
    """``(kind, jti) -> ttl_seconds``. ``expire`` simulates the TTL running out."""

    def __init__(self) -> None:
        self.entries: dict[tuple[TokenType, str], int] = {}
        self._claims: dict[tuple[TokenType, str], SessionClaims] = {}

    async def save(self, claims: SessionClaims, ttl_seconds: int) -> None:
        self.entries[(claims.type, claims.jti)] = ttl_seconds
        self._claims[(claims.type, claims.jti)] = claims

    async def exists(self, kind: TokenType, jti: str) -> bool:
        return (kind, jti) in self.entries

    async def delete(self, claims: SessionClaims) -> bool:
        return self._remove((claims.type, claims.jti))

    async def revoke_session(self, sub: str, sid: str) -> None:
        for key, claims in list(self._claims.items()):
            if (claims.sub, claims.sid) == (sub, sid):
                self._remove(key)

    async def revoke_all(self, sub: str) -> None:
        for key, claims in list(self._claims.items()):
            if claims.sub == sub:
                self._remove(key)

    def expire(self, kind: TokenType, jti: str) -> None:
        self._remove((kind, jti))

    def _remove(self, key: tuple[TokenType, str]) -> bool:
        self._claims.pop(key, None)
        return self.entries.pop(key, None) is not None


class FakeTokenCodec:
    """Opaque tokens ``token-N`` mapped back to the claims they encode."""

    def __init__(self) -> None:
        self.issued: dict[str, SessionClaims] = {}

    def encode(self, claims: SessionClaims) -> str:
        token = f"token-{len(self.issued) + 1}"
        self.issued[token] = claims
        return token

    def decode(self, token: str) -> SessionClaims:
        try:
            return self.issued[token]
        except KeyError:
            raise UnauthorizedError(INVALID_SESSION) from None
