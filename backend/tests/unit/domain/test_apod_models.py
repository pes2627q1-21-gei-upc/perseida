from datetime import date

import pytest
from pydantic import ValidationError

from app.domain.apod.models import Apod, MediaType
from tests.factories.apod import make_apod


def test_apod_keeps_its_fields() -> None:
    apod = make_apod(date(2026, 10, 14), MediaType.VIDEO, copyright="Jane Doe")

    assert apod.apod_date == date(2026, 10, 14)
    assert apod.media_type is MediaType.VIDEO
    assert apod.copyright == "Jane Doe"


def test_copyright_is_optional() -> None:
    assert make_apod().copyright is None


def test_media_type_accepts_its_string_values() -> None:
    apod = Apod.model_validate(
        {
            "apod_date": "2026-10-14",
            "title": "t",
            "explanation": "e",
            "media_type": "video",
            "media_url": "https://example.test/v",
        }
    )

    assert apod.media_type is MediaType.VIDEO


def test_media_type_rejects_unknown_values() -> None:
    with pytest.raises(ValidationError):
        Apod.model_validate(
            {
                "apod_date": "2026-10-14",
                "title": "t",
                "explanation": "e",
                "media_type": "audio",
                "media_url": "https://example.test/a",
            }
        )


def test_apod_is_immutable() -> None:
    apod = make_apod()

    with pytest.raises(ValidationError):
        apod.title = "changed"  # type: ignore[misc]
