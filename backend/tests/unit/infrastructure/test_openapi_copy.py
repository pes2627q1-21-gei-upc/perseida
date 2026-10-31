"""The frontend copy of the OpenAPI schema is the one the TS client is built from
(TG-360, US #360, criteri 4)."""

import json
from pathlib import Path

from app.main import create_app

COPY = Path(__file__).resolve().parents[4] / "frontend" / "openapi" / "openapi.json"
REGENERATE = (
    "cd backend && uv run python -m scripts.export_openapi "
    "&& cd ../frontend && pnpm api:generate"
)


def test_frontend_openapi_copy_matches_backend_schema() -> None:
    copy = json.loads(COPY.read_text(encoding="utf-8"))

    assert create_app().openapi() == copy, (
        f"frontend/openapi/openapi.json is out of date. Run: {REGENERATE}"
    )
