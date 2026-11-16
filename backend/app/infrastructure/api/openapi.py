from typing import Any

from fastapi import FastAPI

PROBLEM_MEDIA_TYPE = "application/problem+json"


def _drop_duplicate_json(spec: dict[str, Any]) -> None:
    """Keep only ``application/problem+json`` on error responses that have it.

    FastAPI adds an ``application/json`` entry whenever a response declares a
    ``model``, but errors are only ever sent as problem+json.
    """
    for path in spec.get("paths", {}).values():
        for operation in path.values():
            for code, response in operation.get("responses", {}).items():
                content = response.get("content", {})
                if code[0] in "45" and PROBLEM_MEDIA_TYPE in content:
                    content.pop("application/json", None)


def install_openapi_cleanup(app: FastAPI) -> None:
    """Make ``app.openapi()`` return the schema without duplicate media types."""
    generate = app.openapi

    def openapi() -> dict[str, Any]:
        spec = generate()
        _drop_duplicate_json(spec)
        return spec

    app.openapi = openapi  # type: ignore[method-assign]
