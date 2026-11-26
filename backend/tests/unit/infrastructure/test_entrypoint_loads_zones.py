"""TG-70 criteri 5: the container loads the observation zones after the
migrations, and only when it runs them."""

import os
import shutil
import subprocess
from pathlib import Path

import pytest

ENTRYPOINT = Path(__file__).resolve().parents[3] / "entrypoint.sh"
LOADER = "python -m app.infrastructure.observation_zones.load_zones"


def _commands(tmp_path: Path, run_migrations: str) -> list[str]:
    bash = shutil.which("bash")
    if os.name == "nt":
        bash = "C:/Program Files/Git/bin/bash.exe"
    if not bash or not Path(bash).exists():
        pytest.skip("bash is required to exercise the container entrypoint")
    log = tmp_path / "commands.log"
    uv = tmp_path / "uv"
    uv.write_text(f'#!/bin/sh\necho "$*" >> "{log.as_posix()}"\n', encoding="utf-8")
    uv.chmod(0o755)
    env = {
        **os.environ,
        "PATH": f"{tmp_path}{os.pathsep}{os.environ['PATH']}",
        "RUN_MIGRATIONS": run_migrations,
    }
    result = subprocess.run(
        [bash, str(ENTRYPOINT)], env=env, capture_output=True, text=True, check=False
    )
    assert result.returncode == 0, result.stderr
    return log.read_text(encoding="utf-8").splitlines() if log.exists() else []


def test_tg70_c5_loads_the_zones_after_the_migrations(tmp_path: Path) -> None:
    commands = _commands(tmp_path, "true")

    assert commands[:2] == ["run alembic upgrade head", f"run {LOADER}"]


def test_tg70_c5_without_migrations_it_does_not_load_the_zones(
    tmp_path: Path,
) -> None:
    commands = _commands(tmp_path, "false")

    assert not any("alembic" in command or LOADER in command for command in commands)
