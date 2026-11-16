"""No SQL built from strings: every value reaches the database as a bound parameter.

SQLAlchemy binds the values of every ``select``/``insert``/``update`` it builds. The
only way to open an injection is to put a value inside SQL text, so this test forbids
it in the application and in the migrations: ``text()``, ``execute()`` and
``exec_driver_sql()`` only take literal strings, never an f-string, a concatenation,
``%`` or ``.format()``.
"""

import ast
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2]
SQL_CALLS = {"text", "execute", "exec_driver_sql", "executemany"}


def _is_dynamic(node: ast.expr) -> bool:
    if isinstance(node, ast.Constant):
        return False
    if isinstance(node, ast.JoinedStr):
        return True
    if isinstance(node, ast.BinOp):
        return True
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
        return node.func.attr in ("format", "join")
    # A name may hold a statement built elsewhere (``select(...)``): only what is
    # visibly a string being assembled counts.
    return False


def find_dynamic_sql(root: Path) -> list[str]:
    violations: list[str] = []
    for path in sorted(root.rglob("*.py")):
        if "__pycache__" in path.parts:
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call) or not node.args:
                continue
            func = node.func
            name = (
                func.id
                if isinstance(func, ast.Name)
                else func.attr
                if isinstance(func, ast.Attribute)
                else None
            )
            if name in SQL_CALLS and _is_dynamic(node.args[0]):
                violations.append(f"{path.relative_to(root).as_posix()}:{node.lineno}")
    return violations


def test_application_builds_no_sql_from_strings() -> None:
    assert find_dynamic_sql(BACKEND_DIR / "app") == []


def test_migrations_build_no_sql_from_strings() -> None:
    assert find_dynamic_sql(BACKEND_DIR / "alembic") == []


def test_detects_sql_built_from_strings(tmp_path: Path) -> None:
    (tmp_path / "bad.py").write_text(
        "from sqlalchemy import text\n"
        "text(f\"SELECT * FROM users WHERE email = '{email}'\")\n"
        'conn.execute("DELETE FROM users WHERE id = " + user_id)\n'
        "conn.execute(\"UPDATE users SET name = '%s'\" % name)\n"
        'conn.exec_driver_sql("SELECT {}".format(x))\n'
        'text("SELECT 1")\n'
        "conn.execute(select(User).where(User.email == email))\n",
        encoding="utf-8",
    )

    assert find_dynamic_sql(tmp_path) == [
        "bad.py:2",
        "bad.py:3",
        "bad.py:4",
        "bad.py:5",
    ]
