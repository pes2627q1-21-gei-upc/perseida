"""TG-63: the container limits incoming WebSocket messages before ASGI."""

import os
import shutil
import subprocess
from pathlib import Path

import pytest

ENTRYPOINT = Path(__file__).resolve().parents[3] / "entrypoint.sh"


@pytest.mark.parametrize("configured, expected", [(None, "65536"), ("131072", "131072")])
def test_entrypoint_passes_application_limit_to_uvicorn(
    tmp_path: Path, configured: str | None, expected: str
) -> None:
    bash = shutil.which("bash")
    if os.name == "nt":
        bash = "C:/Program Files/Git/bin/bash.exe"
    if not bash or not Path(bash).exists():
        pytest.skip("bash is required to exercise the container entrypoint")
    for name, body in {
        "uv": 'shift; exec "$@"',
        "uvicorn": 'printf "%s" "$UVICORN_WS_MAX_SIZE"',
    }.items():
        executable = tmp_path / name
        executable.write_text(f"#!/bin/sh\n{body}\n", encoding="utf-8")
        executable.chmod(0o755)
    env = {**os.environ, "PATH": f"{tmp_path}{os.pathsep}{os.environ['PATH']}", "RUN_MIGRATIONS": "false"}
    env.pop("UVICORN_WS_MAX_SIZE", None)
    env.pop("WS_MAX_FRAME_BYTES", None)
    if configured is not None:
        env["WS_MAX_FRAME_BYTES"] = configured
    result = subprocess.run(
        [bash, str(ENTRYPOINT)], env=env, capture_output=True, text=True, check=False
    )
    assert result.returncode == 0, result.stderr
    assert result.stdout == expected
