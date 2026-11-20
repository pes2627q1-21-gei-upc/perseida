"""The backend suite runs in random order and in parallel (TG-362, US #362).

Criteri 1: pytest-randomly runs in every session and prints the seed.
Criteri 2: ``pytest -n auto`` (pytest-xdist) runs in CI.

Paths are resolved from this file, never from the working directory.
"""

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
