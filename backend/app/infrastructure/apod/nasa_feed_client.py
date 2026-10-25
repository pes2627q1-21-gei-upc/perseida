import asyncio
import datetime as dt
import re
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from urllib.parse import urlsplit

import httpx

from app.domain.apod.models import Apod, MediaType
from app.domain.shared.errors import DomainError
from app.infrastructure.apod.nasa_client import NasaApodError, _is_placeholder

FEED_URL = "https://science.nasa.gov/feed/apod-basic/"

# Undocumented feed with the last ~30 APODs; ``apod:`` is its own namespace.
_APOD_NS = "{https://science.nasa.gov/apod/}"
_IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".gif", ".webp")
# The real feed is a few hundred KB; this only bounds what is parsed (the body is
# already in memory by then).
_MAX_FEED_BYTES = 5 * 1024 * 1024
_BLOCK_TAGS = {"br", "p", "div", "li", "h1", "h2", "h3"}
_EXPLANATION_PREFIX = re.compile(r"^Explanation:\s*", re.IGNORECASE)
# Cuts everything from "Tomorrow's picture:" on (curly or straight apostrophe).
_TOMORROW = re.compile(r"\s*Tomorrow['’]s picture:.*\Z", re.IGNORECASE | re.DOTALL)


class _TextExtractor(HTMLParser):
    """Turns the HTML of the feed into plain text (entities decoded)."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in _BLOCK_TAGS:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        self.parts.append(data)


def _plain_text(html: str | None) -> str:
    parser = _TextExtractor()
    parser.feed(html or "")
    parser.close()
    text = "".join(parser.parts)
    lines = (re.sub(r"[ \t]+", " ", line).strip() for line in text.splitlines())
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def _child_text(item: ET.Element, tag: str) -> str | None:
    child = item.find(tag)
    return None if child is None else child.text


def _is_image(url: str) -> bool:
    return urlsplit(url).path.lower().endswith(_IMAGE_EXTENSIONS)


def _item_date(item: ET.Element) -> dt.date | None:
    try:
        published = parsedate_to_datetime((_child_text(item, "pubDate") or "").strip())
    except TypeError, ValueError:
        return None
    # The APOD date is the UTC day of publication.
    return published.astimezone(dt.UTC).date()


def _parse_feed(content: bytes) -> list[tuple[dt.date, ET.Element]]:
    if len(content) > _MAX_FEED_BYTES:
        raise NasaApodError("NASA APOD feed is too large")
    # A feed never needs a DTD: refusing it rules out entity expansion and external
    # entities without adding a dependency (xml.etree does not fetch them anyway).
    # A DTD can only come before the root element; the items carry whole HTML pages
    # in CDATA (``<!doctype html>``), which are not DTDs.
    first_element = re.search(rb"<[A-Za-z_:]", content)
    prolog = content if first_element is None else content[: first_element.start()]
    if re.search(rb"<!(DOCTYPE|ENTITY)", prolog, re.IGNORECASE):
        raise NasaApodError("NASA APOD feed has a DTD")
    try:
        root = ET.fromstring(content)
    except ET.ParseError as exc:
        raise NasaApodError("NASA APOD feed is not valid XML") from exc
    dated = [(_item_date(item), item) for item in root.iterfind("./channel/item")]
    return [(day, item) for day, item in dated if day is not None]


class NasaApodFeedClient:
    """Reads the APOD RSS feed of science.nasa.gov and translates it into ``Apod``.

    The feed only keeps the latest ~30 days and has no videos here: a date out of
    that window, or an entry whose media is not an image, is a ``NasaApodError``.
    """

    def __init__(
        self, http: httpx.AsyncClient, timeout_seconds: float, url: str = FEED_URL
    ) -> None:
        self._http = http
        self._timeout_seconds = timeout_seconds
        self._url = url

    async def fetch(self, day: dt.date | None = None) -> Apod:
        """Return the APOD of ``day``, or the most recent one when ``day`` is None.

        Raises:
            NasaApodError: on HTTP errors, timeouts (``timeout_seconds`` for the
                whole request), an invalid feed, a date not in the feed or an entry
                that is not a usable image.
        """
        try:
            async with asyncio.timeout(self._timeout_seconds):
                response = await self._http.get(self._url)
            response.raise_for_status()
        except (httpx.HTTPError, TimeoutError) as exc:
            # Only the type: the details stay in ``__cause__``.
            message = f"NASA APOD feed request failed: {type(exc).__name__}"
            raise NasaApodError(message) from exc
        entries = _parse_feed(response.content)
        if day is None:
            candidates = sorted(entries, key=lambda entry: entry[0], reverse=True)
        else:
            candidates = [entry for entry in entries if entry[0] == day]
        if not candidates:
            raise NasaApodError("NASA APOD feed has no entry for that date")
        apod_date, item = candidates[0]
        return self._to_apod(apod_date, item)

    @staticmethod
    def _to_apod(apod_date: dt.date, item: ET.Element) -> Apod:
        # ``apod:url`` is the article page; the image is ``apod:hdurl``.
        media_url = (_child_text(item, f"{_APOD_NS}hdurl") or "").strip()
        if not media_url or not _is_image(media_url):
            raise NasaApodError("NASA APOD feed entry is not an image")
        if _is_placeholder(media_url):
            raise NasaApodError("NASA APOD feed entry is the placeholder logo")
        explanation = _TOMORROW.sub(
            "",
            _EXPLANATION_PREFIX.sub(
                "", _plain_text(_child_text(item, f"{_APOD_NS}explanation"))
            ),
        )
        try:
            return Apod(
                apod_date=apod_date,
                title=(_child_text(item, "title") or "").strip(),
                explanation=explanation,
                media_type=MediaType.IMAGE,
                media_url=media_url,
                copyright=_plain_text(_child_text(item, f"{_APOD_NS}copyright"))
                or None,
            )
        except DomainError as exc:
            raise NasaApodError("NASA APOD feed entry breaks a domain rule") from exc
