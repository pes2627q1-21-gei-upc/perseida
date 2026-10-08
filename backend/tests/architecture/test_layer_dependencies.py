import ast
import sys
from pathlib import Path

APP_DIR = Path(__file__).resolve().parents[2] / "app"

# Allowed import prefixes per layer, besides the standard library.
ALLOWED = {
    "domain": ("pydantic", "app.domain"),
    "application": ("pydantic", "app.domain", "app.application"),
}


def _is_allowed(module: str, prefixes: tuple[str, ...]) -> bool:
    if module.split(".")[0] in sys.stdlib_module_names:
        return True
    return any(module == p or module.startswith(f"{p}.") for p in prefixes)


def _imported_modules(tree: ast.AST) -> list[str]:
    modules: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            modules.extend(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            # Relative imports are rejected: they hide the layer they point to.
            modules.append("." * node.level + (node.module or ""))
    return modules


def find_violations(root: Path, layer: str, prefixes: tuple[str, ...]) -> list[str]:
    violations: list[str] = []
    for path in sorted((root / layer).rglob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for module in _imported_modules(tree):
            if not _is_allowed(module, prefixes):
                relative = path.relative_to(root).as_posix()
                violations.append(f"{relative} imports {module}")
    return violations


def test_domain_only_imports_allowed_modules() -> None:
    assert find_violations(APP_DIR, "domain", ALLOWED["domain"]) == []


def test_application_only_imports_allowed_modules() -> None:
    assert find_violations(APP_DIR, "application", ALLOWED["application"]) == []


def test_detects_forbidden_imports(tmp_path: Path) -> None:
    domain = tmp_path / "domain"
    domain.mkdir()
    (domain / "bad.py").write_text(
        "import os\n"
        "from fastapi import FastAPI\n"
        "from app.infrastructure.health import router\n"
        "from . import sibling\n"
        "from pydantic import BaseModel\n"
        "from app.domain.health import models\n",
        encoding="utf-8",
    )

    violations = find_violations(tmp_path, "domain", ALLOWED["domain"])

    assert violations == [
        "domain/bad.py imports fastapi",
        "domain/bad.py imports app.infrastructure.health",
        "domain/bad.py imports .",
    ]
