"""Write the backend OpenAPI schema to ``frontend/openapi/openapi.json``.

Run from ``backend/``: ``uv run python -m scripts.export_openapi``; then
``pnpm api:generate`` in ``frontend/`` rebuilds the TypeScript client.
"""

import json
from pathlib import Path

from app.main import create_app

TARGET = Path(__file__).resolve().parents[2] / "frontend" / "openapi" / "openapi.json"

if __name__ == "__main__":
    schema = create_app().openapi()
    TARGET.write_text(
        json.dumps(schema, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
