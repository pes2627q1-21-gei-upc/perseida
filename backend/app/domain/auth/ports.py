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

    def decode(self, token: str, *, verify_expiry: bool = True) -> SessionClaims:
        """Return the claims of a token with a valid signature that has not expired.

        With ``verify_expiry=False`` an expired token is accepted (the signature
        and the claims are still checked); only to identify a session to close it.

        Raises:
            UnauthorizedError: code INVALID_SESSION if the signature or the
                expiration is invalid, or the claims are malformed.
        """
        ...


class SessionStore(Protocol):
    """Registry of the issued tokens, so that they can be revoked at once.

    A token is valid only while its ``(kind, jti)`` entry exists. The store also
    indexes the tokens by ``sub`` and ``sid`` to revoke a session or all the
    sessions of a user.
    """

    async def save(self, claims: SessionClaims, ttl_seconds: int) -> None:
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

    async def delete(self, claims: SessionClaims) -> bool:
        """Revoke the token atomically.

        Returns:
            True if this call revoked it, False if it was already missing (so
            of two concurrent calls only one gets True).

        Raises:
            ExternalServiceError: if the store is unavailable.
        """
        ...

    async def revoke_session(self, sub: str, sid: str) -> None:
        """Revoke every token (access and refresh) of one session.

        Raises:
            ExternalServiceError: if the store is unavailable.
        """
        ...

    async def revoke_all(self, sub: str) -> None:
        """Revoke every token of every session of the user.

        Raises:
            ExternalServiceError: if the store is unavailable.
        """
        ...


class AccountGateway(Protocol):
    async def get_status(
        self, identity: GoogleIdentity, language: str | None = None
    ) -> AccountStatus:
        """Return the status of the account identified by ``identity.google_sub``.

        Creates the account on first access (with ``language`` as preferred
        language, ``ca`` if absent or unsupported), in which case the status is
        ``AccountStatus.ACTIVE``.

        Raises:
            ConflictError: code EMAIL_ALREADY_REGISTERED if the email belongs to an
                account linked to another Google ``sub``.
        """
        ...
