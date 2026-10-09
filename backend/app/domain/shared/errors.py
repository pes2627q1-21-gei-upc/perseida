class DomainError(Exception):
    """Base for business errors raised by the domain layer.

    ``code`` is a stable SCREAMING_SNAKE identifier the frontend localizes.
    """

    def __init__(self, code: str, message: str | None = None) -> None:
        self.code = code
        self.message = message or code
        super().__init__(self.message)


class NotFoundError(DomainError):
    """A requested resource does not exist."""


class BusinessRuleViolation(DomainError):  # noqa: N818 (name fixed by ADR-0018)
    """A domain invariant or business rule was violated."""


class ConflictError(DomainError):
    """The operation conflicts with the current state of a resource."""


class ValidationError(DomainError):
    """A domain value failed validation."""
