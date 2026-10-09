"""Domain error hierarchy. TG-304 (US TG-44)."""

import pytest

from app.application.shared.errors import ApplicationError
from app.domain.shared.errors import (
    BusinessRuleViolation,
    ConflictError,
    DomainError,
    NotFoundError,
    ValidationError,
)

SUBCLASSES = [NotFoundError, BusinessRuleViolation, ConflictError, ValidationError]


def test_code_and_message_are_stored() -> None:
    error = DomainError("EVENT_NOT_FOUND", "The event does not exist")

    assert error.code == "EVENT_NOT_FOUND"
    assert error.message == "The event does not exist"
    assert str(error) == "The event does not exist"


def test_message_defaults_to_code() -> None:
    error = DomainError("SOME_CODE")

    assert error.message == "SOME_CODE"
    assert str(error) == "SOME_CODE"


def test_empty_message_defaults_to_code() -> None:
    assert DomainError("SOME_CODE", "").message == "SOME_CODE"


@pytest.mark.parametrize("cls", SUBCLASSES)
def test_subclasses_inherit_from_domain_error(cls: type[DomainError]) -> None:
    error = cls("X_CODE", "msg")

    assert isinstance(error, DomainError)
    assert isinstance(error, Exception)
    assert (error.code, error.message) == ("X_CODE", "msg")


@pytest.mark.parametrize("cls", SUBCLASSES)
def test_subclasses_default_message_to_code(cls: type[DomainError]) -> None:
    assert cls("X_CODE").message == "X_CODE"


@pytest.mark.parametrize("cls", [DomainError, *SUBCLASSES])
def test_domain_errors_are_not_application_errors(cls: type[DomainError]) -> None:
    assert not issubclass(cls, ApplicationError)


def test_domain_error_can_be_raised_and_caught() -> None:
    with pytest.raises(DomainError) as info:
        raise NotFoundError("EVENT_NOT_FOUND")

    assert info.value.code == "EVENT_NOT_FOUND"
