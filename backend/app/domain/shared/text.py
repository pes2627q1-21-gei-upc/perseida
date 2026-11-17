"""Sanitising of text that comes from outside (Google profile, third-party APIs).

The API answers JSON and never HTML, and every query is parametrised, so these
helpers are defence in depth: they keep out what no legitimate value contains (control
characters, NUL bytes that PostgreSQL rejects, non-https links) so that no client or
database has to deal with it.
"""

import re
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


# --- Text written by users (chat messages, event posts) ---------------------------

# Control characters and surrogates (NUL would make PostgreSQL fail), plus the line
# and paragraph separators, which are not control characters but break lines.
_DROPPED_CATEGORIES = ("Cc", "Cs", "Zl", "Zp")
# Newline and tab are kept because a message or a post has them.
_KEPT_CHARACTERS = "\n\t"

# Default_Ignorable_Code_Point (Unicode 18, DerivedCoreProperties.txt) that is
# dangerous: invisible code points that hide or spoof text (bidi overrides and
# isolates, zero-width and tag characters, fillers...). Only these are dropped, so
# unassigned code points (an emoji newer than Python's Unicode) are kept.
# Kept on purpose, although default ignorable: ZWJ and ZWNJ (composed emoji and
# some scripts), LRM, RLM and ALM (single directional marks) and the emoji
# variation selectors FE0E and FE0F.
_DANGEROUS_RANGES = (
    (0x00AD, 0x00AD),  # soft hyphen
    (0x034F, 0x034F),  # combining grapheme joiner
    (0x115F, 0x1160),  # hangul fillers
    (0x17B4, 0x17B5),  # khmer inherent vowels
    (0x180B, 0x180F),  # mongolian variation selectors and vowel separator
    (0x200B, 0x200B),  # zero-width space
    (0x2028, 0x202E),  # line/paragraph separators, bidi embeddings and overrides
    (0x2060, 0x206F),  # word joiner, invisible operators, bidi isolates, obsolete
    (0x3164, 0x3164),  # hangul filler
    (0xFE00, 0xFE0D),  # variation selectors (not the emoji ones)
    (0xFEFF, 0xFEFF),  # zero-width no-break space
    (0xFFA0, 0xFFA0),  # halfwidth hangul filler
    (0xFFF0, 0xFFF8),  # reserved default ignorable
    (0x1BCA0, 0x1BCA3),  # shorthand format controls
    (0x1D173, 0x1D17A),  # musical format controls
    (0xE0000, 0xE0FFF),  # tags, reserved and ideographic variation selectors
)
# The only tag sequences kept: the RGI subdivision flags of England, Scotland and
# Wales. Tag characters can encode hidden ASCII, so any other one is dropped.
_FLAGS = tuple(
    "\U0001f3f4"
    + "".join(chr(0xE0000 + ord(letter)) for letter in subdivision)
    + "\U000e007f"
    for subdivision in ("gbeng", "gbsct", "gbwls")
)
# A known flag matches first and is kept; any other dangerous character is dropped.
_DANGEROUS_OR_FLAG = re.compile(
    "(?P<flag>"
    + "|".join(re.escape(flag) for flag in _FLAGS)
    + ")|["
    + "".join(
        f"{re.escape(chr(low))}-{re.escape(chr(high))}"
        for low, high in _DANGEROUS_RANGES
    )
    + "]"
)
# Not visible by themselves: a text with only these (and blanks) is empty. The
# braille blank is not default ignorable but draws nothing.
_INVISIBLE_MARKS = str.maketrans(
    "", "", "\u200c\u200d\u200e\u200f\u061c\ufe0e\ufe0f\u2800"
)


def clean_user_text(value: str) -> str:
    """Drop dangerous invisible and control characters and surrounding blanks.

    For text that users write (ADR-0024). Never truncates: the length limit is a
    rule of each entity. Markup is not touched, as in ``clean_text``.
    """
    without_invisibles = _DANGEROUS_OR_FLAG.sub(
        lambda match: match.group("flag") or "", value
    )
    kept = "".join(
        char
        for char in without_invisibles
        if char in _KEPT_CHARACTERS
        or unicodedata.category(char) not in _DROPPED_CATEGORIES
    )
    return kept.strip()


def has_visible_text(value: str) -> bool:
    """Whether ``value`` is more than blanks and invisible marks."""
    return bool(value.translate(_INVISIBLE_MARKS).strip())
