from app.application.shared.errors import ApplicationError


class RateLimitedError(ApplicationError):
    """A sender exceeded the configured rate."""


# PostgreSQL is unreachable (connection refused, closed or lost).
DATABASE_UNAVAILABLE = "DATABASE_UNAVAILABLE"
