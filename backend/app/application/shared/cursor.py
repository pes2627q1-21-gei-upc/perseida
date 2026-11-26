"""Opaque keyset cursors: a timestamp plus an id, as base64url JSON.

Shared by the paginated features. Each feature builds its own cursor value
object from the pair and chooses the error code for an invalid cursor.
"""

import base64
import binascii
import json
import uuid
from datetime import datetime

from app.domain.shared.errors import ValidationError

CURSOR_MAX_LENGTH = 256


def encode_cursor(at: datetime, id_: uuid.UUID) -> str:
    """Return the opaque string of the position ``(at, id_)``."""
    raw = json.dumps([at.isoformat(), str(id_)], separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def decode_cursor(value: str, code: str) -> tuple[datetime, uuid.UUID]:
    """Return the ``(timestamp, id)`` of an opaque cursor.

    Only the canonical form ``encode_cursor`` produces is accepted.

    Raises:
        ValidationError: with ``code`` if the cursor is malformed.
    """
    try:
        if len(value) > CURSOR_MAX_LENGTH:
            raise ValueError
        raw = base64.b64decode(
            value + "=" * (-len(value) % 4), altchars=b"-_", validate=True
        )
        data = json.loads(raw)
        if (
            not isinstance(data, list)
            or len(data) != 2
            or not all(isinstance(x, str) for x in data)
        ):
            raise ValueError
        date = datetime.fromisoformat(data[0])
        if date.utcoffset() is None:
            raise ValueError
        id_ = uuid.UUID(data[1])
        if encode_cursor(date, id_) != value:
            raise ValueError
        return date, id_
    except (
        ValueError,
        TypeError,
        UnicodeError,
        binascii.Error,
        OverflowError,
        RecursionError,
    ) as exc:
        raise ValidationError(code) from exc
