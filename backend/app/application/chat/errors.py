from app.application.shared.errors import ApplicationError


class RateLimitedError(ApplicationError):
    """A sender exceeded the configured rate."""
