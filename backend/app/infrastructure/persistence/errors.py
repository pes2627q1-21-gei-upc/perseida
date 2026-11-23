from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy.exc import InterfaceError, OperationalError

from app.application.shared.error_codes import DATABASE_UNAVAILABLE
from app.application.shared.errors import ExternalServiceError


@contextmanager
def database_errors() -> Iterator[None]:
    """Map a connection failure to ``ExternalServiceError`` (no details leak)."""
    try:
        yield
    except (OperationalError, InterfaceError, OSError) as exc:
        raise ExternalServiceError(DATABASE_UNAVAILABLE) from exc
