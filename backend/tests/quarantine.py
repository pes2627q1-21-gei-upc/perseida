"""Quarantine of flaky tests, without reruns (TG-362, task TG-382).

A flaky test is marked ``@pytest.mark.quarantine(reason="TG-NNN ...")``: the
blocking CI step skips it (``-m "not quarantine"``) and a non-blocking step runs
it. ``reason`` must name the Taiga task that fixes it; otherwise collection
fails. Activated by ``tests/conftest.py`` (or ``-p tests.quarantine``).
"""

import re

import pytest

_TASK = re.compile(r"\bTG-\d+\b")


def pytest_collection_modifyitems(
    config: pytest.Config, items: list[pytest.Item]
) -> None:
    """Fail collection if a ``quarantine`` mark has no ``reason="TG-NNN ..."``."""
    for item in items:
        for mark in item.iter_markers("quarantine"):
            reason = mark.kwargs.get("reason")
            if not isinstance(reason, str) or not _TASK.search(reason):
                raise pytest.UsageError(
                    f"{item.nodeid}: @pytest.mark.quarantine needs "
                    'reason="TG-NNN ..." naming the Taiga task that fixes it '
                    f"(got reason={reason!r})"
                )
