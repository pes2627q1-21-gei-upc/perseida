import pytest
from pydantic import ValidationError

from app.domain.auth.models import (
    AccountStatus,
    GoogleIdentity,
    TokenType,
)


def test_enum_values_are_the_contract_with_the_jwt_and_the_accounts() -> None:
    # TokenType is the ``type`` claim of our JWTs; AccountStatus is shared with #45.
    assert {t.value for t in TokenType} == {"access", "refresh"}
    assert {s.value for s in AccountStatus} == {
        "active",
        "suspended",
        "banned",
        "deleted",
    }


def test_google_identity_name_and_picture_are_optional() -> None:
    identity = GoogleIdentity(google_sub="google-123", email="ana@example.com")

    assert identity.name is None
    assert identity.picture is None


def test_models_are_immutable() -> None:
    identity = GoogleIdentity(google_sub="google-123", email="ana@example.com")

    with pytest.raises(ValidationError):
        identity.email = "other@example.com"  # type: ignore[misc]
