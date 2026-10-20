"""AuthService.login with fake ports. TG-44."""

from datetime import UTC, datetime, timedelta

import pytest

from app.application.auth.auth_service import AuthService, SessionDurations
from app.application.auth.errors import (
    ACCOUNT_DELETED,
    ACCOUNT_SUSPENDED,
    INVALID_GOOGLE_TOKEN,
)
from app.application.shared.errors import ForbiddenError, UnauthorizedError
from app.domain.auth.models import AccountStatus, GoogleIdentity, TokenType
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
