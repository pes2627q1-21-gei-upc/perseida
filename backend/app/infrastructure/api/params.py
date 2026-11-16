import datetime as dt
import re
from typing import Annotated

from pydantic import BeforeValidator

_ISO_DATE = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}")


def _require_iso_format(value: object) -> object:
    """Reject anything but YYYY-MM-DD; Pydantic's lax mode also takes more."""
    if not isinstance(value, str) or not _ISO_DATE.fullmatch(value):
        raise ValueError("Date must use the YYYY-MM-DD format")
    return value


IsoDate = Annotated[dt.date, BeforeValidator(_require_iso_format)]
