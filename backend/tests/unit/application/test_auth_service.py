"""AuthService.login with fake ports. TG-44."""

import asyncio
from datetime import UTC, datetime, timedelta

import pytest

from app.application.auth.auth_service import AuthService, SessionDurations
from app.application.auth.errors import (
    ACCOUNT_DELETED,
    ACCOUNT_SUSPENDED,
    INVALID_GOOGLE_TOKEN,
    INVALID_SESSION,
)
from app.application.shared.errors import ForbiddenError, UnauthorizedError
from app.domain.auth.models import (
    AccountStatus,
    GoogleIdentity,
    SessionClaims,
    TokenType,
)
from tests.fakes.auth import (
    FakeAccountGateway,
    FakeGoogleTokenVerifier,
    FakeTokenCodec,
    InMemorySessionStore,
)

NOW = datetime(2026, 10, 20, 12, 0, tzinfo=UTC)
DURATIONS = SessionDurations(access_seconds=900, refresh_seconds=2_592_000)
IDENTITY = GoogleIdentity(google_sub="google-123", email="ana@example.com")


def make_service(
    status: AccountStatus = AccountStatus.ACTIVE,
    verifier_failure: Exception | None = None,
) -> tuple[AuthService, FakeTokenCodec, InMemorySessionStore, FakeAccountGateway]:
    codec = FakeTokenCodec()
    store = InMemorySessionStore()
    accounts = FakeAccountGateway(status)
    service = AuthService(
        FakeGoogleTokenVerifier(IDENTITY, verifier_failure),
        codec,
        store,
        accounts,
        DURATIONS,
        now=lambda: NOW,
    )
    return service, codec, store, accounts


async def test_login_returns_an_access_and_a_refresh_token() -> None:
    service, codec, _, _ = make_service()

    tokens = await service.login("google-id-token")

    assert tokens.access_token != tokens.refresh_token
    assert tokens.expires_in == 900
    access = codec.decode(tokens.access_token)
    refresh = codec.decode(tokens.refresh_token)
    assert (access.type, refresh.type) == (TokenType.ACCESS, TokenType.REFRESH)
    assert access.sub == refresh.sub == "google-123"
    assert access.jti != refresh.jti
    assert access.sid == refresh.sid
    assert access.exp == NOW + timedelta(minutes=15)
    assert refresh.exp == NOW + timedelta(days=30)


async def test_login_registers_each_token_with_its_lifetime() -> None:
    service, codec, store, _ = make_service()

    tokens = await service.login("google-id-token")

    access = codec.decode(tokens.access_token)
    refresh = codec.decode(tokens.refresh_token)
    assert store.entries == {
        (TokenType.ACCESS, access.jti): 900,
        (TokenType.REFRESH, refresh.jti): 2_592_000,
    }


@pytest.mark.parametrize(
    ("status", "code"),
    [
        (AccountStatus.SUSPENDED, ACCOUNT_SUSPENDED),
        (AccountStatus.BANNED, ACCOUNT_SUSPENDED),
        (AccountStatus.DELETED, ACCOUNT_DELETED),
    ],
)
async def test_login_rejects_accounts_that_cannot_log_in(
    status: AccountStatus, code: str
) -> None:
    service, codec, store, _ = make_service(status)

    with pytest.raises(ForbiddenError) as exc_info:
        await service.login("google-id-token")

    assert exc_info.value.code == code
    assert store.entries == {}
    assert codec.issued == {}


async def test_login_with_an_invalid_google_token_issues_nothing() -> None:
    failure = UnauthorizedError(INVALID_GOOGLE_TOKEN)
    service, codec, store, accounts = make_service(verifier_failure=failure)

    with pytest.raises(UnauthorizedError) as exc_info:
        await service.login("forged")

    assert exc_info.value.code == INVALID_GOOGLE_TOKEN
    assert accounts.asked == []
    assert store.entries == {}
    assert codec.issued == {}


async def test_refresh_works_once_and_the_second_attempt_is_rejected() -> None:
    service, _, _, _ = make_service()
    first = await service.login("google-id-token")

    renewed = await service.refresh(first.refresh_token)

    assert renewed.access_token not in (first.access_token, first.refresh_token)
    assert renewed.refresh_token != first.refresh_token
    with pytest.raises(UnauthorizedError) as exc_info:
        await service.refresh(first.refresh_token)
    assert exc_info.value.code == INVALID_SESSION


async def test_refresh_revokes_the_old_refresh_and_registers_the_new_pair() -> None:
    service, codec, store, _ = make_service()
    first = await service.login("google-id-token")
    old_refresh = codec.decode(first.refresh_token)

    renewed = await service.refresh(first.refresh_token)

    assert (TokenType.REFRESH, old_refresh.jti) not in store.entries
    new_access = codec.decode(renewed.access_token)
    new_refresh = codec.decode(renewed.refresh_token)
    assert store.entries[(TokenType.ACCESS, new_access.jti)] == 900
    assert store.entries[(TokenType.REFRESH, new_refresh.jti)] == 2_592_000


async def test_refresh_rejects_an_access_token() -> None:
    service, _, _, _ = make_service()
    tokens = await service.login("google-id-token")

    with pytest.raises(UnauthorizedError) as exc_info:
        await service.refresh(tokens.access_token)

    assert exc_info.value.code == INVALID_SESSION


async def test_authenticate_returns_the_claims_of_a_valid_access_token() -> None:
    service, codec, _, _ = make_service()
    tokens = await service.login("google-id-token")

    claims = await service.authenticate(tokens.access_token)

    assert claims == codec.decode(tokens.access_token)
    assert claims.sub == "google-123"


async def test_authenticate_rejects_a_refresh_token() -> None:
    service, _, _, _ = make_service()
    tokens = await service.login("google-id-token")

    with pytest.raises(UnauthorizedError) as exc_info:
        await service.authenticate(tokens.refresh_token)

    assert exc_info.value.code == INVALID_SESSION


async def test_authenticate_rejects_a_revoked_access_token() -> None:
    service, codec, store, _ = make_service()
    tokens = await service.login("google-id-token")
    store.expire(TokenType.ACCESS, codec.decode(tokens.access_token).jti)

    with pytest.raises(UnauthorizedError) as exc_info:
        await service.authenticate(tokens.access_token)

    assert exc_info.value.code == INVALID_SESSION


@pytest.mark.parametrize("operation", ["authenticate", "refresh"])
async def test_a_token_the_codec_rejects_is_an_invalid_session(operation: str) -> None:
    service, _, _, _ = make_service()

    with pytest.raises(UnauthorizedError) as exc_info:
        await getattr(service, operation)("forged-or-expired")

    assert exc_info.value.code == INVALID_SESSION


async def test_refresh_keeps_the_sid_of_the_session() -> None:
    service, codec, _, _ = make_service()
    first = await service.login("google-id-token")

    renewed = await service.refresh(first.refresh_token)

    sids = {
        codec.decode(token).sid
        for token in (
            first.access_token,
            first.refresh_token,
            renewed.access_token,
            renewed.refresh_token,
        )
    }
    assert len(sids) == 1


async def test_each_login_starts_a_new_session() -> None:
    service, codec, _, _ = make_service()

    first = await service.login("google-id-token")
    second = await service.login("google-id-token")

    assert codec.decode(first.access_token).sid != codec.decode(second.access_token).sid


async def test_concurrent_refreshes_with_the_same_token_only_one_wins() -> None:
    service, _, _, _ = make_service()
    first = await service.login("google-id-token")

    results = await asyncio.gather(
        service.refresh(first.refresh_token),
        service.refresh(first.refresh_token),
        return_exceptions=True,
    )

    failures = [r for r in results if isinstance(r, UnauthorizedError)]
    assert len(failures) == 1
    assert failures[0].code == INVALID_SESSION


async def test_revoking_the_session_invalidates_the_whole_pair() -> None:
    service, codec, store, _ = make_service()
    tokens = await service.login("google-id-token")
    claims = codec.decode(tokens.access_token)

    await store.revoke_session(claims.sub, claims.sid)

    for operation, token in (
        (service.authenticate, tokens.access_token),
        (service.refresh, tokens.refresh_token),
    ):
        with pytest.raises(UnauthorizedError):
            await operation(token)


async def test_revoking_all_the_sessions_of_a_user_leaves_other_users_alone() -> None:
    service, codec, store, _ = make_service()
    tokens = await service.login("google-id-token")
    other = SessionClaims(
        sub="google-999",
        jti="other-jti",
        sid="other-sid",
        type=TokenType.ACCESS,
        exp=NOW,
    )
    await store.save(other, 900)

    await store.revoke_all("google-123")

    with pytest.raises(UnauthorizedError):
        await service.authenticate(tokens.access_token)
    assert await store.exists(TokenType.ACCESS, "other-jti")
