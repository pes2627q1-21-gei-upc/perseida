from app.application.shared.errors import ApplicationError


class RateLimitedError(ApplicationError):
    """A sender exceeded the configured rate."""


# The room (or the author) of a message to store does not exist.
CHAT_ROOM_NOT_FOUND = "CHAT_ROOM_NOT_FOUND"
