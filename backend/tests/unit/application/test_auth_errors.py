"""Stable codes and HTTP statuses of the auth errors. TG-44."""

import pytest

from app.application.auth.errors import (
    ACCOUNT_DELETED,
    ACCOUNT_SUSPENDED,
    IDENTITY_PROVIDER_UNAVAILABLE,
    INVALID_GOOGLE_TOKEN,
    INVALID_SESSION,
)
from app.application.shared.errors import (
    ApplicationError,
    ExternalServiceError,
    ForbiddenError,
    UnauthorizedError,
)
from app.infrastructure.api.error_handlers import resolve_status


# The codes are a contract with the frontend (it translates by code): the literals
# are spelled out so that renaming a constant's value breaks this test.
@pytest.mark.parametrize(
    ("error_class", "code", "literal", "status"),
    [
        (UnauthorizedError, INVALID_GOOGLE_TOKEN, "INVALID_GOOGLE_TOKEN", 401),
        (UnauthorizedError, INVALID_SESSION, "INVALID_SESSION", 401),
        (ForbiddenError, ACCOUNT_SUSPENDED, "ACCOUNT_SUSPENDED", 403),
        (ForbiddenError, ACCOUNT_DELETED, "ACCOUNT_DELETED", 403),
        (
            ExternalServiceError,
            IDENTITY_PROVIDER_UNAVAILABLE,
            "IDENTITY_PROVIDER_UNAVAILABLE",
            503,
        ),
    ],
)
def test_code_value_and_status(
    error_class: type[ApplicationError], code: str, literal: str, status: int
) -> None:
    assert code == literal
    assert resolve_status(error_class(code)) == status
