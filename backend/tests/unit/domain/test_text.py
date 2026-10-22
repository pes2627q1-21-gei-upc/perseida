import pytest

from app.domain.shared.text import clean_text, safe_https_url


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
