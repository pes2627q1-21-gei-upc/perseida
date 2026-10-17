import json
import logging
from datetime import UTC, datetime

from app.infrastructure.api.correlation import correlation_id_var

# Attributes every LogRecord has; anything else came from ``extra=``.
_STANDARD_ATTRS = frozenset(vars(logging.LogRecord("", 0, "", 0, "", None, None))) | {
    "message",
    "asctime",
    "taskName",
    "color_message",  # uvicorn's ANSI-coloured duplicate of the message
}

_UVICORN_LOGGERS = ("uvicorn", "uvicorn.error", "uvicorn.access")


class JsonFormatter(logging.Formatter):
    """Render each record as one JSON line, including ``extra`` fields."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "timestamp": datetime.fromtimestamp(record.created, UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        payload.update(
            {k: v for k, v in vars(record).items() if k not in _STANDARD_ATTRS}
        )
        if (correlation_id := correlation_id_var.get()) is not None:
            payload["correlation_id"] = correlation_id
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def configure_logging(level: int = logging.INFO) -> None:
    """Send root and uvicorn logs to stderr as JSON; safe to call repeatedly."""
    root = logging.getLogger()
    root.handlers = [
        h for h in root.handlers if not isinstance(h.formatter, JsonFormatter)
    ]
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    root.addHandler(handler)
    root.setLevel(level)
    # uvicorn installs its own plain-text handlers; route them through the root.
    for name in _UVICORN_LOGGERS:
        uvicorn_logger = logging.getLogger(name)
        uvicorn_logger.handlers = []
        uvicorn_logger.propagate = True
