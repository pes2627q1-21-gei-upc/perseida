"""The backend suite runs in random order and in parallel (TG-362, US #362).

Criteri 1: pytest-randomly runs in every session and prints the seed.
Criteri 2: ``pytest -n auto`` (pytest-xdist) runs in CI.
Criteri 3 (TG-382): a flaky test is marked
``@pytest.mark.quarantine(reason="TG-NNN ...")`` and runs in its own
non-blocking CI step; ``pytest-rerunfailures`` (and ``flaky``) are forbidden.
Without ``reason``, or with a ``reason`` that has no ``TG-<digits>``, the
collection fails with a clear error.

Contract for the quarantine check (exercised in a subprocess, see
``_run_quarantine``): it lives in the importable plugin module
``tests/quarantine.py`` (``backend/tests/quarantine.py``), which defines the
hook ``pytest_collection_modifyitems(config, items)`` and raises
``pytest.UsageError`` naming the test and ``TG-`` when a ``quarantine`` mark is
invalid. ``tests/conftest.py`` activates it for the real suite (re-exporting the
hook or registering the module as a plugin).

Paths are resolved from this file, never from the working directory.
"""

import importlib
import os
import re
import subprocess
import sys
import tomllib
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[2]
PYPROJECT = BACKEND_DIR / "pyproject.toml"
CI_WORKFLOW = BACKEND_DIR.parent / ".github" / "workflows" / "ci.yml"

PINNED_TOOLS = {
    "pytest-randomly": "5.1.0",
    "pytest-xdist": "3.8.0",
}


def _dev_dependencies() -> list[str]:
    data = tomllib.loads(PYPROJECT.read_text(encoding="utf-8"))
    dev: list[str] = data["dependency-groups"]["dev"]
    return dev


def _backend_job(workflow: str) -> str:
    """Text of the ``backend`` job: from its key to the next top-level job."""
    match = re.search(
        r"^  backend:\n(?P<body>(?:^(?:    .*|\s*)\n)+)", workflow, re.MULTILINE
    )
    assert match, "ci.yml has no 'backend' job"
    return match["body"]


@pytest.mark.parametrize(("package", "version"), PINNED_TOOLS.items())
def test_tg362_test_plugin_is_pinned_in_the_dev_group(
    package: str, version: str
) -> None:
    assert f"{package}=={version}" in _dev_dependencies()


def test_tg362_random_order_is_not_disabled_by_addopts() -> None:
    data = tomllib.loads(PYPROJECT.read_text(encoding="utf-8"))
    addopts = data["tool"]["pytest"]["ini_options"].get("addopts", "")

    assert "no:randomly" not in addopts
    assert "-p no:xdist" not in addopts


def test_tg362_ci_runs_the_backend_tests_in_parallel() -> None:
    job = _backend_job(CI_WORKFLOW.read_text(encoding="utf-8"))
    pytest_runs = re.findall(r"run:\s*(uv run pytest\b.*)", job)

    assert pytest_runs, "the backend job has no 'uv run pytest' step"
    for command in pytest_runs:
        assert re.search(r"\s-n auto\b", command), command


def _run_pytest(tmp_path: Path, *args: str) -> subprocess.CompletedProcess[str]:
    (tmp_path / "test_sample.py").write_text(
        "def test_one():\n    pass\n\n\ndef test_two():\n    pass\n",
        encoding="utf-8",
    )
    return subprocess.run(  # noqa: S603
        [sys.executable, "-m", "pytest", "-p", "no:cacheprovider", *args],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        check=False,
    )


def test_tg362_every_session_prints_the_random_seed(tmp_path: Path) -> None:
    result = _run_pytest(tmp_path)

    assert result.returncode == 0, result.stdout + result.stderr
    assert re.search(r"--randomly-seed=\d+", result.stdout), result.stdout


def test_tg362_tests_can_run_in_parallel_workers(tmp_path: Path) -> None:
    result = _run_pytest(tmp_path, "-n", "2")

    assert result.returncode == 0, result.stdout + result.stderr
    assert "2 workers" in result.stdout, result.stdout


QUARANTINE_PLUGIN = "tests.quarantine"
FORBIDDEN_RERUN_PLUGINS = ("pytest-rerunfailures", "flaky")


def _ini_options() -> dict[str, object]:
    data = tomllib.loads(PYPROJECT.read_text(encoding="utf-8"))
    options: dict[str, object] = data["tool"]["pytest"]["ini_options"]
    return options


def _backend_steps() -> list[str]:
    """Each step of the ``backend`` job, as text, from its ``- `` line."""
    job = _backend_job(CI_WORKFLOW.read_text(encoding="utf-8"))
    return re.split(r"^      - ", job, flags=re.MULTILINE)[1:]


def _pytest_run(step: str) -> str | None:
    match = re.search(r"run:\s*(uv run pytest\b.*)", step)
    return match[1] if match else None


def test_tg362_quarantine_marker_is_registered() -> None:
    markers = _ini_options().get("markers", [])

    assert isinstance(markers, list), markers
    assert any(re.match(r"quarantine\b", str(marker)) for marker in markers), markers


@pytest.mark.parametrize("package", FORBIDDEN_RERUN_PLUGINS)
def test_tg362_rerun_plugins_are_forbidden(package: str) -> None:
    lock = (BACKEND_DIR / "uv.lock").read_text(encoding="utf-8")

    assert package not in PYPROJECT.read_text(encoding="utf-8")
    assert f'name = "{package}"' not in lock


def test_tg362_addopts_does_not_rerun_failures() -> None:
    addopts = str(_ini_options().get("addopts", ""))

    assert "--reruns" not in addopts
    assert "rerunfailures" not in addopts


def test_tg362_blocking_ci_tests_exclude_quarantine() -> None:
    blocking = [
        run
        for step in _backend_steps()
        if (run := _pytest_run(step)) and "--cov-fail-under" in run
    ]

    assert len(blocking) == 1, blocking
    assert re.search(r"\s-m [\"']not quarantine[\"']", blocking[0]), blocking[0]


def test_tg362_ci_runs_quarantine_in_a_non_blocking_step() -> None:
    quarantine = [
        step
        for step in _backend_steps()
        if (run := _pytest_run(step)) and re.search(r"\s-m [\"']?quarantine\b", run)
    ]

    assert len(quarantine) == 1, "the backend job has no 'pytest -m quarantine' step"
    step = quarantine[0]
    assert re.search(r"^\s*continue-on-error:\s*true\s*$", step, re.MULTILINE), step
    assert "--cov-fail-under" not in step, step


def test_tg362_quarantine_plugin_is_active_in_the_suite(
    pytestconfig: pytest.Config,
) -> None:
    plugin = importlib.import_module(QUARANTINE_PLUGIN)
    hook = plugin.pytest_collection_modifyitems

    active = [
        candidate
        for candidate in pytestconfig.pluginmanager.get_plugins()
        if getattr(candidate, "pytest_collection_modifyitems", None) is hook
    ]
    assert active, f"{QUARANTINE_PLUGIN} is not active in the backend suite"


def _run_quarantine(tmp_path: Path, mark: str) -> subprocess.CompletedProcess[str]:
    """Run one test with ``mark`` and only the real quarantine plugin."""
    (tmp_path / "test_flaky.py").write_text(
        f"import pytest\n\n\n{mark}\ndef test_flaky():\n    pass\n",
        encoding="utf-8",
    )
    env = {**os.environ, "PYTHONPATH": str(BACKEND_DIR)}
    return subprocess.run(  # noqa: S603
        [
            sys.executable,
            "-m",
            "pytest",
            "-p",
            "no:cacheprovider",
            "-p",
            "no:randomly",
            "-p",
            QUARANTINE_PLUGIN,
            "test_flaky.py",
        ],
        cwd=tmp_path,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )


@pytest.mark.parametrize(
    "mark",
    [
        "@pytest.mark.quarantine",
        "@pytest.mark.quarantine()",
        '@pytest.mark.quarantine(reason="")',
        '@pytest.mark.quarantine(reason="flaky on CI")',
        '@pytest.mark.quarantine(reason="TG- flaky")',
        '@pytest.mark.quarantine("TG-999 flaky")',
    ],
    ids=["bare", "empty", "blank-reason", "no-task", "no-digits", "positional"],
)
def test_tg362_quarantine_without_a_task_fails_collection(
    tmp_path: Path, mark: str
) -> None:
    result = _run_quarantine(tmp_path, mark)
    output = result.stdout + result.stderr

    assert result.returncode == pytest.ExitCode.USAGE_ERROR, output
    assert "TG-" in output, output
    assert "test_flaky" in output, output
    assert "ModuleNotFoundError" not in output, output


def test_tg362_quarantine_with_a_task_runs(tmp_path: Path) -> None:
    result = _run_quarantine(tmp_path, '@pytest.mark.quarantine(reason="TG-999 flaky")')

    assert result.returncode == pytest.ExitCode.OK, result.stdout + result.stderr
    assert "1 passed" in result.stdout, result.stdout
