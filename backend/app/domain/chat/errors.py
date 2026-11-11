"""Stable error codes of the chat (ADR-0018) and its fixed limits."""

# Longest text of a message, once cleaned (US #64, criterion 7).
MESSAGE_MAX_LENGTH = 1000

CHAT_MESSAGE_EMPTY = "CHAT_MESSAGE_EMPTY"
CHAT_MESSAGE_TOO_LONG = "CHAT_MESSAGE_TOO_LONG"
# A message the moderator refused (``ModerationResult.approved`` is False).
CHAT_MESSAGE_REJECTED = "CHAT_MESSAGE_REJECTED"
