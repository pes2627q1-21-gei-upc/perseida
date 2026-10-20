from typing import Protocol

from app.domain.auth.models import (
    AccountStatus,
    GoogleIdentity,
    SessionClaims,
    TokenType,
)


class GoogleTokenVerifier(Protocol):
    async def verify(self, id_token: str) -> GoogleIdentity:
        """Return the identity asserted by a valid Google ID token.

        Checks the RS256 signature against Google's public keys, the issuer, the
        audience, the expiration and that the email is verified.

        Raises:
            UnauthorizedError: code INVALID_GOOGLE_TOKEN if any check fails.
            ExternalServiceError: code IDENTITY_PROVIDER_UNAVAILABLE if Google's
                keys cannot be fetched and none are cached.
        """
        ...


class TokenCodec(Protocol):
    def encode(self, claims: SessionClaims) -> str:
        """Return the signed token for ``claims``."""
        ...

    def decode(self, token: str) -> SessionClaims:
        """Return the claims of a token with a valid signature that has not expired.

        Raises:
            UnauthorizedError: code INVALID_SESSION if the signature or the
                expiration is invalid, or the claims are malformed.
        """
        ...


class SessionStore(Protocol):
    """Registry of the issued tokens, so that they can be revoked at once.

    A token is valid only while its ``(kind, jti)`` entry exists.
    """

    async def save(self, kind: TokenType, jti: str, ttl_seconds: int) -> None:
        """Register the token; the entry disappears after ``ttl_seconds``.

        Raises:
            ExternalServiceError: if the store is unavailable.
        """
        ...

    async def exists(self, kind: TokenType, jti: str) -> bool:
        """Return whether the token is registered (not revoked nor expired).

        Raises:
            ExternalServiceError: if the store is unavailable.
        """
        ...

    async def delete(self, kind: TokenType, jti: str) -> None:
        """Revoke the token. Deleting a missing entry is not an error.

        Raises:
            ExternalServiceError: if the store is unavailable.
        """
        ...


class AccountGateway(Protocol):
    async def get_status(self, identity: GoogleIdentity) -> AccountStatus:
        """Return the status of the account identified by ``identity.google_sub``.

        The implementation (US #45) may create the user on first access, in which
        case the status is ``AccountStatus.ACTIVE``.
        """
        ...
