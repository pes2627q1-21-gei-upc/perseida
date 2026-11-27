# Re-exported for the chat callers; it lives in application.shared (TG-645).
from app.application.shared.errors import RateLimitedError as RateLimitedError

# The room (or the author) of a message to store does not exist.
CHAT_ROOM_NOT_FOUND = "CHAT_ROOM_NOT_FOUND"
