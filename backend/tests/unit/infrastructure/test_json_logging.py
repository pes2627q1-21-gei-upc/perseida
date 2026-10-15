import json
import logging
import sys

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
