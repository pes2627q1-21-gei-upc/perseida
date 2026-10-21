import uuid
from datetime import UTC, datetime

import pytest
from pydantic import ValidationError as PydanticValidationError

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
