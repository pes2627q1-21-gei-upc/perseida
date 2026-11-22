"""Stable error codes of the direct chat (ADR-0018) and its fixed limits."""

# Longest text of a message, once cleaned (US #65, criterion 7).
MESSAGE_MAX_LENGTH = 1000

# A user tried to open a conversation with, or block, themselves.
CANNOT_MESSAGE_SELF = "CANNOT_MESSAGE_SELF"
# An empty or too long message text.
VALIDATION_ERROR = "VALIDATION_ERROR"
# The conversation does not exist, or the user is not one of its participants:
# both look the same (404) so a stranger cannot learn that it exists.
CONVERSATION_NOT_FOUND = "CONVERSATION_NOT_FOUND"
# The other user of a conversation to open does not exist (or was deleted).
USER_NOT_FOUND = "USER_NOT_FOUND"
# Either user blocks the other: nobody can send in the conversation (history stays).
USER_BLOCKED = "USER_BLOCKED"
# A ``client_message_id`` already used by the sender for another conversation or
# another text (409): an idempotent retry must repeat the same message.
DIRECT_IDEMPOTENCY_CONFLICT = "DIRECT_IDEMPOTENCY_CONFLICT"
