from datetime import UTC, datetime

import pytest

from app.application.auth.errors import (
    ACCOUNT_DELETED,
    ACCOUNT_SUSPENDED,
    INVALID_SESSION,
)
from app.application.shared.errors import ForbiddenError, UnauthorizedError
from app.application.users.errors import EMAIL_ALREADY_REGISTERED
from app.application.users.user_service import UserService
from app.domain.shared.account import AccountStatus
from app.domain.shared.errors import ConflictError
from app.domain.users.models import AccountStatus as UserStatus
from app.domain.users.models import Language, User
from tests.fakes.users import InMemoryUserRepository

NOW = datetime(2026, 10, 21, 12, 0, tzinfo=UTC)
PROFILE = {
    "google_sub": "sub-1",
    "email": "Ada@Example.test",
    "display_name": "Ada",
    "avatar_url": "https://example.test/a.png",
}


def _service(repo: InMemoryUserRepository) -> UserService:
    return UserService(repo, now=lambda: NOW)


def _existing(**overrides: object) -> User:
    user = User.create(google_sub="sub-1", email="ada@example.test")
    return user.model_copy(update=overrides)


async def test_first_access_creates_the_account_from_the_google_profile() -> None:
    # TG-137 / US #45 criteri 2
    repo = InMemoryUserRepository()

    status = await _service(repo).sign_in(**PROFILE)

    assert status is AccountStatus.ACTIVE
    user = repo.users["sub-1"]
    assert (user.email, user.display_name, user.avatar_url) == (
        "ada@example.test",
        "Ada",
        "https://example.test/a.png",
    )
    assert user.role.value == "user"


@pytest.mark.parametrize(
    ("language", "expected"),
    [
        ("es", Language.ES),
        ("en", Language.EN),
        ("fr", Language.CA),
        (None, Language.CA),
    ],
)
async def test_first_access_stores_the_device_language_or_falls_back_to_ca(
    language: str | None, expected: Language
) -> None:
    # TG-137 / US #45 criteri 1 (idioma per defecte)
    repo = InMemoryUserRepository()

    await _service(repo).sign_in(**PROFILE, language=language)

    assert repo.users["sub-1"].preferred_language is expected


async def test_returning_access_updates_last_login_without_a_new_user() -> None:
    # TG-137 / US #45 criteri 3
    existing = _existing()
    repo = InMemoryUserRepository(existing)

    status = await _service(repo).sign_in(**PROFILE, language="en")

    assert status is AccountStatus.ACTIVE
    assert len(repo.users) == 1
    assert [u.last_login_at for u in repo.saved_logins] == [NOW]
    assert repo.users["sub-1"].id == existing.id
    assert repo.users["sub-1"].preferred_language is Language.CA


async def test_deleted_account_is_reported_and_not_touched() -> None:
    # TG-137 / US #45 criteri 5
    repo = InMemoryUserRepository(_existing(deleted_at=NOW))

    status = await _service(repo).sign_in(**PROFILE)

    assert status is AccountStatus.DELETED
    assert repo.saved_logins == []
    assert len(repo.users) == 1


@pytest.mark.parametrize(
    ("stored", "expected"),
    [
        (UserStatus.SUSPENDED, AccountStatus.SUSPENDED),
        (UserStatus.BANNED, AccountStatus.BANNED),
    ],
)
async def test_suspended_or_banned_account_is_reported_and_not_touched(
    stored: UserStatus, expected: AccountStatus
) -> None:
    # TG-137 / US #45 criteri 6
    repo = InMemoryUserRepository(_existing(status=stored))

    status = await _service(repo).sign_in(**PROFILE)

    assert status is expected
    assert repo.saved_logins == []


async def test_email_of_another_google_account_is_a_conflict() -> None:
    # TG-137 / US #45 criteri 3: cap duplicat per email
    other = User.create(google_sub="sub-other", email="ada@example.test")
    repo = InMemoryUserRepository(other)

    with pytest.raises(ConflictError) as exc_info:
        await _service(repo).sign_in(**PROFILE)

    assert exc_info.value.code == EMAIL_ALREADY_REGISTERED
    assert list(repo.users) == ["sub-other"]


async def test_losing_a_registration_race_returns_the_winner_status() -> None:
    # TG-137 / US #45 criteri 4: add() torna el compte creat per l'altra petició
    winner = _existing()

    class RacyRepository(InMemoryUserRepository):
        async def get_by_google_sub(self, google_sub: str) -> User | None:
            return None

        async def add(self, user: User) -> User:
            self.users[winner.google_sub] = winner
            return winner

    repo = RacyRepository()

    assert await _service(repo).sign_in(**PROFILE) is AccountStatus.ACTIVE
    assert list(repo.users.values()) == [winner]


async def test_get_profile_returns_the_active_account() -> None:
    # TG-139 / US #45 criteri 7
    existing = _existing()
    repo = InMemoryUserRepository(existing)

    assert await _service(repo).get_profile("sub-1") == existing


async def test_get_profile_of_a_session_without_account_is_an_invalid_session() -> None:
    with pytest.raises(UnauthorizedError) as exc_info:
        await _service(InMemoryUserRepository()).get_profile("sub-1")

    assert exc_info.value.code == INVALID_SESSION


@pytest.mark.parametrize(
    ("overrides", "code"),
    [
        ({"status": UserStatus.SUSPENDED}, ACCOUNT_SUSPENDED),
        ({"status": UserStatus.BANNED}, ACCOUNT_SUSPENDED),
        ({"deleted_at": NOW}, ACCOUNT_DELETED),
    ],
)
async def test_get_profile_rejects_suspended_banned_and_deleted_accounts(
    overrides: dict[str, object], code: str
) -> None:
    # TG-139 / US #45 criteri 6
    repo = InMemoryUserRepository(_existing(**overrides))

    with pytest.raises(ForbiddenError) as exc_info:
        await _service(repo).get_profile("sub-1")

    assert exc_info.value.code == code
