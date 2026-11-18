import pytest

from app.domain.shared.text import (
    clean_text,
    clean_user_text,
    has_visible_text,
    safe_https_url,
)


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("Ada Lovelace", "Ada Lovelace"),
        ("  Ada  ", "Ada"),
        ("Ada\x00Lovelace", "AdaLovelace"),
        ("Ada\x07\x1b[31mLovelace", "Ada[31mLovelace"),
        ("Ada\nLovelace\t", "AdaLovelace"),
        ("\u202eAda", "Ada"[0:0] + "\u202eAda"),
        ("", None),
        ("   ", None),
        ("\x00\x01", None),
        (None, None),
    ],
)
def test_clean_text_strips_control_characters(
    value: str | None, expected: str | None
) -> None:
    assert clean_text(value, 255) == expected


def test_clean_text_keeps_markup_for_the_output_to_escape() -> None:
    # Escaping is the job of the output; stripping here would corrupt real names.
    assert clean_text("<script>alert(1)</script>", 255) == "<script>alert(1)</script>"


def test_clean_text_cuts_to_the_limit_without_trailing_blanks() -> None:
    assert clean_text("a" * 300, 255) == "a" * 255
    assert clean_text("ab" + " " * 10 + "cd", 3) == "ab"


@pytest.mark.parametrize(
    "url",
    [
        "https://example.test/a.png",
        "https://lh3.googleusercontent.com/a/abc=s96-c",
        "  https://example.test/a.png  ",
    ],
)
def test_safe_https_url_accepts_plain_https_links(url: str) -> None:
    assert safe_https_url(url) == url.strip()


@pytest.mark.parametrize(
    "url",
    [
        "javascript:alert(1)",
        "JaVaScRiPt:alert(1)",
        "data:image/png;base64,AAAA",
        "http://example.test/a.png",
        "ftp://example.test/a.png",
        "file:///etc/passwd",
        "//example.test/a.png",
        "https:///no-host",
        "https://user:pass@example.test/a.png",
        "https://exam ple.test/a.png",
        "https://example.test/a\x00.png",
        "https://example.test/" + "a" * 2100,
        "https://[::1",
        "",
        "   ",
        None,
    ],
)
def test_safe_https_url_rejects_everything_else(url: str | None) -> None:
    assert safe_https_url(url) is None


GBENG = "\U0001f3f4\U000e0067\U000e0062\U000e0065\U000e006e\U000e0067\U000e007f"


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("  Es veu J\u00fapiter\n\tpel nord  ", "Es veu J\u00fapiter\n\tpel nord"),
        ("a\x00b\u2028c\u2029d", "abcd"),
        ("\u202eadmin\u200b\u00ad\ufeff", "admin"),
        ("hidden\U000e0041\U000e0100", "hidden"),
        (f"Anglaterra {GBENG}", f"Anglaterra {GBENG}"),
        ("\U0001f3f4\U000e0068\U000e0069\U000e007f", "\U0001f3f4"),
        ("\U0001f469\u200d\U0001f680", "\U0001f469\u200d\U0001f680"),
        ("<b>no es toca</b>", "<b>no es toca</b>"),
    ],
)
def test_clean_user_text_drops_dangerous_invisibles_and_keeps_the_rest(
    value: str, expected: str
) -> None:
    assert clean_user_text(value) == expected


def test_clean_user_text_never_truncates() -> None:
    assert clean_user_text("a" * 5000) == "a" * 5000


@pytest.mark.parametrize(
    ("value", "visible"),
    [
        ("hola", True),
        (GBENG, True),
        ("", False),
        (" \n\t", False),
        ("\u200c\u200d\u200e\u200f\u061c\ufe0e\ufe0f\u2800", False),
    ],
)
def test_has_visible_text_ignores_blanks_and_invisible_marks(
    value: str, visible: bool
) -> None:
    assert has_visible_text(value) is visible
