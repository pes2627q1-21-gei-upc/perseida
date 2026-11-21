"""The backend suite runs in random order and in parallel, and CI audits its
security (TG-362, US #362).

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

Criteri 4 (TG-383): ``uv run bandit -c pyproject.toml -r app -ll --ignore-nosec``
is a blocking step of the ``backend`` job (medium and high findings fail the PR);
its configuration is ``[tool.bandit]`` in ``backend/pyproject.toml``, the only
place where a finding may be justified (inline ``# nosec`` comments are ignored).
B314 (``xml.etree`` on the NASA feed) is fixed with ``defusedxml``, a pinned
production dependency, not skipped.
Criteri 5 (TG-383): a blocking step exports the production requirements from the
lockfile (``uv export --frozen --no-dev ...``) and audits them with
``uv run pip-audit -r <file> -s osv``.
Criteri 6 (TG-384): the ``frontend`` job runs
``pnpm audit --prod --audit-level=high`` in ``frontend/`` right after
``pnpm install``, as a warning (``continue-on-error: true``) until TG-338, which
accepts the documented risks (today GHSA-mrhx-c7xc-m3w5, ``zod`` via
``@expo/cli``) and makes it blocking with the team's agreement; the step (its
name or the comment above it) names TG-338 so the warning is not forgotten.

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
    "bandit[toml]": "1.9.4",
    "pip-audit": "2.10.1",
}
DEFUSEDXML = "defusedxml==0.7.1"


def _dev_dependencies() -> list[str]:
    data = tomllib.loads(PYPROJECT.read_text(encoding="utf-8"))
    dev: list[str] = data["dependency-groups"]["dev"]
    return dev


def _job(workflow: str, name: str) -> str:
    """Text of the job ``name``: from its key to the next top-level job."""
    match = re.search(
        rf"^  {re.escape(name)}:\n(?P<body>(?:^(?:    .*|\s*)\n)+)",
        workflow,
        re.MULTILINE,
    )
    assert match, f"ci.yml has no '{name}' job"
    return match["body"]


def _backend_job(workflow: str) -> str:
    """Text of the ``backend`` job: from its key to the next top-level job."""
    return _job(workflow, "backend")


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
    pytest_runs = [
        command
        for command in re.findall(r"run:\s*(uv run pytest\b.*)", job)
        if not re.search(r"\s--collect-only\b", command)
    ]

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


def _steps_with_comments(job: str) -> list[str]:
    """Each step of ``job``, as text, including the comment lines just above its
    ``- `` line (a comment there documents the step that follows it)."""
    steps: list[list[str]] = []
    comments: list[str] = []
    for line in job.splitlines(keepends=True):
        if re.match(r"      #", line):
            comments.append(line)
        elif line.startswith("      - "):
            steps.append([*comments, line])
            comments = []
        elif steps:
            steps[-1].extend([*comments, line])
            comments = []
    return ["".join(step) for step in steps]


def _backend_steps() -> list[str]:
    """Each step of the ``backend`` job, as text, with the comments above it."""
    return _steps_with_comments(_backend_job(CI_WORKFLOW.read_text(encoding="utf-8")))


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


def _run_quarantine(
    tmp_path: Path, mark: str, *args: str
) -> subprocess.CompletedProcess[str]:
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
            *args,
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


def test_tg362_ci_validates_quarantine_markers_before_the_parallel_run() -> None:
    """With ``-n`` the UsageError is raised inside the workers and xdist ends
    with an INTERNALERROR that hides the message, so CI first collects the suite
    without xdist, as a blocking step, before the parallel run (TG-382)."""
    runs = [_pytest_run(step) for step in _backend_steps()]
    collect = [
        index
        for index, run in enumerate(runs)
        if run and re.search(r"\s--collect-only\b", run)
    ]
    blocking = [
        index for index, run in enumerate(runs) if run and "--cov-fail-under" in run
    ]

    assert len(collect) == 1, "the backend job has no 'uv run pytest --collect-only'"
    assert len(blocking) == 1, blocking
    step, command = _backend_steps()[collect[0]], runs[collect[0]]
    assert command is not None
    assert not re.search(r"\s(-n|--numprocesses)\b", command), command
    assert "continue-on-error" not in step, step
    assert collect[0] < blocking[0], "the collection must run before the tests"


def test_tg362_collection_without_xdist_reports_an_invalid_quarantine(
    tmp_path: Path,
) -> None:
    result = _run_quarantine(tmp_path, "@pytest.mark.quarantine", "--collect-only")
    output = result.stdout + result.stderr

    assert result.returncode == pytest.ExitCode.USAGE_ERROR, output
    assert "TG-" in output, output
    assert "INTERNALERROR" not in output, output


def _steps_running(pattern: str) -> list[str]:
    return [step for step in _backend_steps() if re.search(pattern, step)]


def _assert_blocking(step: str) -> None:
    assert "continue-on-error" not in step, step
    assert not re.search(r"\|\|\s*(true|:|exit 0)\b", step), step


def test_tg362_ci_runs_bandit_as_a_blocking_step() -> None:
    steps = _steps_running(r"\buv run\b[^\n]*\bbandit\b")

    assert len(steps) == 1, "the backend job has no 'uv run bandit' step"
    step = steps[0]
    assert re.search(r"\s-c pyproject\.toml\b", step), step
    assert re.search(r"\s-r app\b", step), step
    # Medium and high findings: -ll (not -lll, which only reports high).
    assert re.search(r"\s(-ll(?!l)|--severity-level[ =]medium)\b", step), step
    # Justifications live only in [tool.bandit]: an inline ``# nosec`` must not
    # silence a finding (criteri 4).
    assert re.search(r"\s--ignore-nosec\b", step), step
    _assert_blocking(step)


def test_tg362_bandit_is_configured_in_pyproject() -> None:
    data = tomllib.loads(PYPROJECT.read_text(encoding="utf-8"))
    bandit = data["tool"].get("bandit")

    assert isinstance(bandit, dict), "pyproject.toml has no [tool.bandit] section"
    # The XML of the NASA feed is parsed with defusedxml, not skipped (TG-383).
    skips = bandit.get("skips", [])
    assert "B314" not in skips, skips
    assert "B405" not in skips, skips


def test_tg362_ci_audits_the_production_lockfile_with_osv() -> None:
    steps = _backend_steps()
    audits = [
        index
        for index, step in enumerate(steps)
        if re.search(r"\buv run\b[^\n]*\bpip-audit\b", step)
    ]

    assert len(audits) == 1, "the backend job has no 'uv run pip-audit' step"
    audit = steps[audits[0]]
    assert re.search(r"\s(-s|--vulnerability-service)[ =]osv\b", audit), audit
    _assert_blocking(audit)

    requirements = re.search(
        r"\bpip-audit\b[^\n]*\s(?:-r|--requirement)[ =](\S+)", audit
    )
    assert requirements, audit
    exports = [
        match
        for step in steps[: audits[0] + 1]
        for match in re.finditer(r"\buv export\b[^\n]*", step)
    ]
    assert exports, "the requirements audited are not a 'uv export'"
    production = [
        export[0]
        for export in exports
        if re.search(r"\s--no-dev\b", export[0])
        and re.search(r"\s--(frozen|locked)\b", export[0])
        and requirements[1] in export[0]
    ]
    assert production, (exports, requirements[1])


def test_tg362_defusedxml_is_a_pinned_production_dependency() -> None:
    data = tomllib.loads(PYPROJECT.read_text(encoding="utf-8"))

    assert DEFUSEDXML in data["project"]["dependencies"]


def _runs_in_frontend(job: str, step: str) -> bool:
    """True when ``step`` runs inside ``frontend/``: the job sets
    ``defaults.run.working-directory: frontend`` or the step sets its own
    ``working-directory: frontend``."""
    job_default = re.search(
        r"^    defaults:\n      run:\n        working-directory:\s*frontend/?\s*$",
        job,
        re.MULTILINE,
    )
    step_own = re.search(
        r"^        working-directory:\s*frontend/?\s*$", step, re.MULTILINE
    )
    return bool(job_default or step_own)


def _assert_frontend_audit(workflow: str) -> None:
    job = _job(workflow, "frontend")
    steps = _steps_with_comments(job)
    installs = [
        index
        for index, step in enumerate(steps)
        if re.search(r"run:\s*pnpm install\b", step)
    ]
    audits = [
        index
        for index, step in enumerate(steps)
        if re.search(r"run:\s*pnpm audit\b", step)
    ]

    assert len(installs) == 1, "the frontend job has no 'pnpm install' step"
    assert len(audits) == 1, "the frontend job has no 'pnpm audit' step"
    audit = steps[audits[0]]
    command = re.search(r"run:\s*(pnpm audit\b[^\n]*)", audit)
    assert command, audit
    assert re.search(r"\s--prod\b", command[1]), command[1]
    assert re.search(r"\s--audit-level[ =]high\b", command[1]), command[1]
    assert audits[0] == installs[0] + 1, "the audit must run right after the install"
    # A warning until TG-338 accepts the documented risks and makes it blocking.
    assert re.search(r"^\s*continue-on-error:\s*true\s*$", audit, re.MULTILINE), audit
    assert re.search(r"\bTG-338\b", audit), audit
    assert _runs_in_frontend(job, audit), "the audit must run in frontend/"


def test_tg362_ci_audits_the_frontend_production_dependencies() -> None:
    _assert_frontend_audit(CI_WORKFLOW.read_text(encoding="utf-8"))


def test_tg384_frontend_audit_check_rejects_a_step_outside_frontend() -> None:
    workflow = CI_WORKFLOW.read_text(encoding="utf-8")
    defaults = "    defaults:\n      run:\n        working-directory: frontend\n"
    frontend = _job(workflow, "frontend")
    assert defaults in frontend, "ci.yml changed: update this test"
    without = workflow.replace(frontend, frontend.replace(defaults, ""))

    with pytest.raises(AssertionError, match="must run in frontend/"):
        _assert_frontend_audit(without)
