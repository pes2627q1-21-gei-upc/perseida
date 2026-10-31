"""import-linter contracts must hold (TG-360, US #360, criteris 6 i 7).

Complements ``test_layer_dependencies.py`` (allowlist, relative imports and
users/auth isolation); the contracts forbid external packages and fix the
direction infrastructure -> application -> domain.
"""

import subprocess
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2]


def test_import_linter_contracts_are_kept() -> None:
    result = subprocess.run(  # noqa: S603
        [
            sys.executable,
            "-c",
            "from importlinter.cli import lint_imports_command; lint_imports_command()",
        ],
        cwd=BACKEND_DIR,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stdout + result.stderr
