import ast
from pathlib import Path

ROUTER = (
    Path(__file__).resolve().parents[2]
    / "app"
    / "infrastructure"
    / "realtime"
    / "router.py"
)
FORBIDDEN = {"CurrentSessionDep", "HTTPBearer", "get_current_session"}


def _names(tree: ast.AST) -> set[str]:
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            names.update(alias.name for alias in node.names)
        elif isinstance(node, ast.Name):
            names.add(node.id)
        elif isinstance(node, ast.Attribute):
            names.add(node.attr)
    return names


def test_the_websocket_router_does_not_use_the_http_bearer_auth() -> None:
    # TG-63 criteri 12: the token travels in the first frame, never in the handshake.
    assert ROUTER.exists(), "app/infrastructure/realtime/router.py is missing"

    used = _names(ast.parse(ROUTER.read_text(encoding="utf-8")))

    assert used & FORBIDDEN == set()
