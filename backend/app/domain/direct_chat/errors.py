"""Stable error codes of the direct chat (ADR-0018) and its fixed limits."""

# Longest text of a message, once cleaned (US #65, criterion 7).
MESSAGE_MAX_LENGTH = 1000

# A user tried to open a conversation with, or block, themselves.
CANNOT_MESSAGE_SELF = "CANNOT_MESSAGE_SELF"
# An empty or too long message text.
VALIDATION_ERROR = "VALIDATION_ERROR"
# A user who is not one of the two participants tried to act on a conversation.
NOT_A_PARTICIPANT = "NOT_A_PARTICIPANT"
