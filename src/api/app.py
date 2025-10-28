"""FastAPI application exposing schema and palette metadata for the UI."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict

try:  # pragma: no cover - exercised implicitly when fastapi is available
    from fastapi import FastAPI, HTTPException
except ModuleNotFoundError:  # pragma: no cover - fallback for offline test envs
    class HTTPException(Exception):
        """Lightweight HTTPException fallback mimicking FastAPI."""

        def __init__(self, status_code: int, detail: str) -> None:
            self.status_code = status_code
            self.detail = detail
            super().__init__(detail)

    class FastAPI:  # type: ignore[misc]
        """Minimal stand-in that records route handlers for direct invocation."""

        def __init__(self, *_, **__):
            self.routes: Dict[str, Any] = {}

        def get(self, path: str):
            def decorator(func):
                self.routes[path] = func
                return func

            return decorator

BASE_DIR = Path(__file__).resolve().parent.parent.parent
SCHEMAS_DIR = BASE_DIR / "schemas"
PALETTE_PATH = BASE_DIR / "ui" / "palette" / "unit_palette.json"

app = FastAPI(title="HBD Thermal Flex API", version="0.1.0")


def _load_json_file(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as fp:
        return json.load(fp)


@lru_cache(maxsize=1)
def _schema_index() -> Dict[str, Dict[str, Any]]:
    index: Dict[str, Dict[str, Any]] = {}
    if not SCHEMAS_DIR.exists():
        return index

    for schema_file in sorted(SCHEMAS_DIR.glob("*.schema.json")):
        schema_name = schema_file.name.split(".")[0]
        index[schema_name] = _load_json_file(schema_file)

    return index


@lru_cache(maxsize=1)
def _unit_palette() -> Dict[str, Any]:
    if not PALETTE_PATH.exists():
        return {}
    return _load_json_file(PALETTE_PATH)


@app.get("/schemas")
def list_schemas(refresh: bool = False) -> Dict[str, Dict[str, Any]]:
    """Return all available JSON schemas for unit parameter forms."""

    if refresh:
        _schema_index.cache_clear()
    schemas = _schema_index()
    # Return a deep copy so callers cannot mutate the cached data.
    return json.loads(json.dumps(schemas))


@app.get("/schemas/{schema_name}")
def get_schema(schema_name: str, refresh: bool = False) -> Dict[str, Any]:
    """Return a specific schema by name or raise a 404 error."""

    schemas = list_schemas(refresh=refresh)
    schema = schemas.get(schema_name)
    if schema is None:
        raise HTTPException(status_code=404, detail=f"Schema '{schema_name}' not found")
    return schema


@app.get("/palette/units")
def get_unit_palette(refresh: bool = False) -> Dict[str, Any]:
    """Expose the UI unit palette metadata for client rendering."""

    if refresh:
        _unit_palette.cache_clear()
    palette = _unit_palette()
    return json.loads(json.dumps(palette))


__all__ = ["app", "list_schemas", "get_schema", "get_unit_palette", "HTTPException"]
