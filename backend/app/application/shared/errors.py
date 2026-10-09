class ApplicationError(Exception):
    """Base for errors raised by the application layer.

    ``code`` is a stable SCREAMING_SNAKE identifier the frontend localizes.
    """

    def __init__(self, code: str, message: str | None = None) -> None:
        self.code = code
        self.message = message or code
        super().__init__(self.message)


class UnauthorizedError(ApplicationError):
    """The caller is not authenticated."""


class ForbiddenError(ApplicationError):
    """The caller is authenticated but not allowed to perform the action."""


class ExternalServiceError(ApplicationError):
    """An external dependency failed and no cached data could be served."""
