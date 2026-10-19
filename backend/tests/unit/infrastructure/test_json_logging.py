import json
import logging
import sys

from app.infrastructure.api.correlation import correlation_id_var
from app.infrastructure.logging import JsonFormatter, configure_logging


def _record(**extra: object) -> logging.LogRecord:
    record = logging.LogRecord(
        "app.test", logging.ERROR, "f.py", 1, "hi %s", ("x",), None
    )
    for key, value in extra.items():
        setattr(record, key, value)
    return record


def test_formats_one_json_line_with_extra_fields() -> None:
    line = JsonFormatter().format(_record(job="purge"))

    payload = json.loads(line)
    assert payload["level"] == "ERROR"
    assert payload["logger"] == "app.test"
    assert payload["message"] == "hi x"
    assert payload["job"] == "purge"
    assert "timestamp" in payload


def test_includes_exception_traceback() -> None:
    try:
        raise ValueError("bad")
    except ValueError:
        record = logging.LogRecord(
            "app.test",
            logging.ERROR,
            "f.py",
            1,
            "failed",
            None,
            sys.exc_info(),
        )

    payload = json.loads(JsonFormatter().format(record))

    assert "ValueError: bad" in payload["exc_info"]


def test_configure_logging_is_idempotent() -> None:
    root = logging.getLogger()
    before = list(root.handlers)
    try:
        configure_logging()
        configure_logging()
        json_handlers = [
            h for h in root.handlers if isinstance(h.formatter, JsonFormatter)
        ]
        assert len(json_handlers) == 1
    finally:
        root.handlers = before


def test_includes_correlation_id_when_bound() -> None:
    token = correlation_id_var.set("abc-123")
    try:
        payload = json.loads(JsonFormatter().format(_record()))
    finally:
        correlation_id_var.reset(token)

    assert payload["correlation_id"] == "abc-123"


def test_omits_correlation_id_and_color_message_when_absent() -> None:
    payload = json.loads(JsonFormatter().format(_record(color_message="[1mhi")))

    assert "correlation_id" not in payload
    assert "color_message" not in payload


def test_configure_logging_routes_uvicorn_through_root() -> None:
    uvicorn_logger = logging.getLogger("uvicorn.access")
    uvicorn_logger.handlers = [logging.StreamHandler()]
    uvicorn_logger.propagate = False
    root = logging.getLogger()
    before = list(root.handlers)
    try:
        configure_logging()

        assert uvicorn_logger.handlers == []
        assert uvicorn_logger.propagate is True
    finally:
        root.handlers = before
