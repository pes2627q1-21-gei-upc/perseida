"""Application error hierarchy. TG-304 (US TG-44)."""

import pytest

from app.application.shared.errors import (
    ApplicationError,
    ExternalServiceError,
    ForbiddenError,
    UnauthorizedError,
)
from app.domain.shared.errors import DomainError

SUBCLASSES = [UnauthorizedError, ForbiddenError, ExternalServiceError]


def test_code_and_message_are_stored() -> None:
    error = ApplicationError("NO_SESSION", "Login required")

    assert error.code == "NO_SESSION"
    assert error.message == "Login required"
    assert str(error) == "Login required"


def test_message_defaults_to_code() -> None:
    assert ApplicationError("SOME_CODE").message == "SOME_CODE"


def test_empty_message_defaults_to_code() -> None:
    assert ApplicationError("SOME_CODE", "").message == "SOME_CODE"


@pytest.mark.parametrize("cls", SUBCLASSES)
def test_subclasses_inherit_from_application_error(
    cls: type[ApplicationError],
) -> None:
    error = cls("X_CODE", "msg")

    assert isinstance(error, ApplicationError)
    assert isinstance(error, Exception)
    assert (error.code, error.message) == ("X_CODE", "msg")
    assert cls("X_CODE").message == "X_CODE"


@pytest.mark.parametrize("cls", [ApplicationError, *SUBCLASSES])
def test_application_errors_are_not_domain_errors(
    cls: type[ApplicationError],
) -> None:
    assert not issubclass(cls, DomainError)
