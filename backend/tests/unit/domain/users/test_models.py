import uuid
from datetime import UTC, datetime

import pytest
from pydantic import ValidationError as PydanticValidationError

from app.domain.auth.models import AccountStatus as AuthAccountStatus
from app.domain.shared.errors import ValidationError
from app.domain.users.models import AccountStatus, Language, Role, User


def _user(**overrides: object) -> User:
    now = datetime.now(UTC)
    data: dict[str, object] = {
        "id": uuid.uuid7(),
        "google_sub": "sub-123",
        "email": "ada@example.test",
        "created_at": now,
        "last_login_at": now,
    }
    data.update(overrides)
    return User.model_validate(data)


def test_create_applies_defaults() -> None:
    # TG-135 / US #45 criteri 1: compte nou amb idioma, rol i estat per defecte
    user = User.create(google_sub="sub-123", email="ada@example.test")

    assert user.preferred_language is Language.CA
    assert user.role is Role.USER
    assert user.status is AccountStatus.ACTIVE
    assert user.deleted_at is None
    assert user.display_name is None
    assert user.avatar_url is None


def test_create_generates_uuid_v7_id() -> None:
    user = User.create(google_sub="sub-123", email="ada@example.test")

    assert user.id.version == 7
    assert User.create(google_sub="b", email="b@example.test").id != user.id


def test_create_sets_timezone_aware_timestamps() -> None:
    before = datetime.now(UTC)
    user = User.create(google_sub="sub-123", email="ada@example.test")
    after = datetime.now(UTC)

    assert user.created_at.tzinfo is not None
    assert user.last_login_at.tzinfo is not None
    assert before <= user.created_at <= after
    assert user.last_login_at == user.created_at


def test_create_accepts_preferred_language() -> None:
    # TG-135 / US #45 criteri 1: l'idioma del dispositiu, si es coneix
    user = User.create(
        google_sub="sub-123", email="ada@example.test", preferred_language=Language.EN
    )

    assert user.preferred_language is Language.EN


def test_create_keeps_optional_profile_fields() -> None:
    user = User.create(
        google_sub="sub-123",
        email="ada@example.test",
        display_name="Ada",
        avatar_url="https://example.test/a.png",
    )

    assert user.display_name == "Ada"
    assert user.avatar_url == "https://example.test/a.png"


def test_email_is_stripped_and_lowercased() -> None:
    # TG-135 / US #45 criteri 3: correu normalitzat
    user = User.create(google_sub="sub-123", email="  Ada.Lovelace@Example.TEST \n")

    assert user.email == "ada.lovelace@example.test"


@pytest.mark.parametrize("email", ["", "   ", "\t\n"])
def test_blank_email_is_rejected(email: str) -> None:
    with pytest.raises(ValidationError) as exc_info:
        User.create(google_sub="sub-123", email=email)

    assert exc_info.value.code == "USER_EMAIL_EMPTY"


@pytest.mark.parametrize("google_sub", ["", "   ", "\t\n"])
def test_blank_google_sub_is_rejected(google_sub: str) -> None:
    with pytest.raises(ValidationError) as exc_info:
        User.create(google_sub=google_sub, email="ada@example.test")

    assert exc_info.value.code == "USER_GOOGLE_SUB_EMPTY"


def test_is_deleted_is_false_without_deleted_at() -> None:
    assert _user().is_deleted is False


def test_is_deleted_is_true_when_deleted_at_is_set() -> None:
    assert _user(deleted_at=datetime.now(UTC)).is_deleted is True


def test_user_is_frozen() -> None:
    user = _user()

    with pytest.raises(PydanticValidationError):
        user.email = "other@example.test"  # type: ignore[misc]


def test_record_login_updates_last_login_only() -> None:
    # TG-136 / US #45 criteri 3: l'accés recurrent actualitza last_login_at
    user = _user(last_login_at=datetime(2026, 1, 1, tzinfo=UTC))
    now = datetime(2026, 10, 21, 12, 0, tzinfo=UTC)

    updated = user.record_login(now)

    assert updated.last_login_at == now
    assert updated.model_copy(update={"last_login_at": user.last_login_at}) == user
    assert user.last_login_at == datetime(2026, 1, 1, tzinfo=UTC)


def test_account_status_is_active_for_a_new_account() -> None:
    assert _user().account_status is AuthAccountStatus.ACTIVE


@pytest.mark.parametrize(
    ("status", "expected"),
    [
        (AccountStatus.SUSPENDED, AuthAccountStatus.SUSPENDED),
        (AccountStatus.BANNED, AuthAccountStatus.BANNED),
    ],
)
def test_account_status_reflects_suspension_and_ban(
    status: AccountStatus, expected: AuthAccountStatus
) -> None:
    # TG-136 / US #45 criteri 6
    assert _user(status=status).account_status is expected


@pytest.mark.parametrize(
    "status", [AccountStatus.ACTIVE, AccountStatus.SUSPENDED, AccountStatus.BANNED]
)
def test_account_status_is_deleted_whenever_deleted_at_is_set(
    status: AccountStatus,
) -> None:
    # TG-136 / US #45 criteri 5: l'esborrat preval sobre qualsevol altre estat
    user = _user(status=status, deleted_at=datetime.now(UTC))

    assert user.account_status is AuthAccountStatus.DELETED


def test_display_name_loses_control_characters_and_is_cut_to_the_column() -> None:
    # Hardening: NUL bytes make PostgreSQL fail and the column is 255 long
    user = User.create(
        google_sub="sub-123",
        email="ada@example.test",
        display_name="A\x00da" + "x" * 300,
    )

    assert user.display_name is not None
    assert "\x00" not in user.display_name
    assert len(user.display_name) == 255


def test_display_name_keeps_markup_as_text() -> None:
    user = User.create(
        google_sub="sub-123",
        email="ada@example.test",
        display_name="<img src=x onerror=alert(1)>",
    )

    assert user.display_name == "<img src=x onerror=alert(1)>"


def test_a_blank_display_name_becomes_none() -> None:
    user = User.create(
        google_sub="sub-123", email="ada@example.test", display_name=" \x00 "
    )

    assert user.display_name is None


@pytest.mark.parametrize(
    "avatar_url",
    ["javascript:alert(1)", "data:image/png;base64,AAAA", "http://example.test/a.png"],
)
def test_an_avatar_that_is_not_a_plain_https_link_is_dropped(avatar_url: str) -> None:
    user = User.create(
        google_sub="sub-123", email="ada@example.test", avatar_url=avatar_url
    )

    assert user.avatar_url is None


@pytest.mark.parametrize(
    "email",
    [
        "a" * 320 + "@example.test",
        "ada @example.test",
        "ada\x00@example.test",
        "a\nb@example.test",
    ],
)
def test_a_malformed_or_oversized_email_is_rejected(email: str) -> None:
    with pytest.raises(ValidationError) as exc_info:
        User.create(google_sub="sub-123", email=email)

    assert exc_info.value.code == "USER_EMAIL_INVALID"
