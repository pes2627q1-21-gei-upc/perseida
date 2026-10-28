"""Sanitising of text that comes from outside (Google profile, third-party APIs).

The API answers JSON and never HTML, and every query is parametrised, so these
helpers are defence in depth: they keep out what no legitimate value contains (control
characters, NUL bytes that PostgreSQL rejects, non-https links) so that no client or
database has to deal with it.
"""

import unicodedata
from urllib.parse import urlsplit

MAX_URL_LENGTH = 2048


def clean_text(value: str | None, max_length: int) -> str | None:
    """Strip control characters and surrounding blanks, cut to ``max_length``.

    Returns None when nothing is left. Markup is not touched: escaping is the job of the
    output (React escapes text), and removing it here would corrupt legitimate names.
    """
    if value is None:
        return None
    cleaned = "".join(
        char
        for char in value
        if unicodedata.category(char) not in ("Cc", "Cs", "Co", "Cn")
    )
    cleaned = cleaned.strip()[:max_length].strip()
    return cleaned or None


def safe_https_url(value: str | None, max_length: int = MAX_URL_LENGTH) -> str | None:
    """Return the URL if it is a plain https link, else None.

    Rejects other schemes (``javascript:``, ``data:``, ``http:``...), credentials in the
    URL, blanks and control characters, and URLs over ``max_length``.
    """
    if value is None:
        return None
    url = value.strip()
    if not url or len(url) > max_length:
        return None
    if any(char.isspace() or unicodedata.category(char) == "Cc" for char in url):
        return None
    try:
        parts = urlsplit(url)
        hostname = parts.hostname
    except ValueError:
        return None
    if parts.scheme.lower() != "https" or not hostname:
        return None
    if parts.username is not None or parts.password is not None:
        return None
    return url
