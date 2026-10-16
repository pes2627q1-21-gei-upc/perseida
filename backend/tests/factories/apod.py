from datetime import date

from app.domain.apod.models import Apod, MediaType


def make_apod(
    apod_date: date = date(2026, 10, 14),
    media_type: MediaType = MediaType.IMAGE,
    copyright: str | None = None,
) -> Apod:
    return Apod(
        apod_date=apod_date,
        title=f"APOD {apod_date.isoformat()}",
        explanation="An astronomical picture.",
        media_type=media_type,
        media_url=f"https://apod.nasa.gov/{apod_date.isoformat()}",
        copyright=copyright,
    )
