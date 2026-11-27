"""Stable error codes of the chat (ADR-0018) and its fixed limits."""

from app.domain.shared.moderation import CHAT_MESSAGE_REJECTED as CHAT_MESSAGE_REJECTED

# Longest text of a message, once cleaned (US #64, criterion 7).
MESSAGE_MAX_LENGTH = 1000

# Most messages a page of the history may hold (US #64, criterion 10). The router
# and the service reject a ``limit`` outside ``1..PAGE_MAX_LIMIT``.
PAGE_MAX_LIMIT = 50

CHAT_MESSAGE_EMPTY = "CHAT_MESSAGE_EMPTY"
CHAT_MESSAGE_TOO_LONG = "CHAT_MESSAGE_TOO_LONG"
# CHAT_MESSAGE_REJECTED (a message the moderator refused) lives in domain.shared.
# A history request with a malformed ``before`` cursor, or ``limit`` outside
# ``1..PAGE_MAX_LIMIT``.
CHAT_INVALID_CURSOR = "CHAT_INVALID_CURSOR"
CHAT_INVALID_LIMIT = "CHAT_INVALID_LIMIT"
# The same ``client_message_id`` was already used by the author for another message
# (other room or other text).
CHAT_IDEMPOTENCY_CONFLICT = "CHAT_IDEMPOTENCY_CONFLICT"
