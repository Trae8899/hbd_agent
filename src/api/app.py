"""FastAPI application exposing schema and palette metadata for the UI."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict

try:  # pragma: no cover - exercised implicitly when fastapi is available
    from fastapi import FastAPI, HTTPException
    from fastapi.responses import HTMLResponse, JSONResponse
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

        def get(self, path: str, *_, **__):
            def decorator(func):
                self.routes[path] = func
                return func

            return decorator

        def post(self, path: str, *_, **__):
            def decorator(func):
                self.routes[path] = func
                return func

            return decorator

    class JSONResponse:  # type: ignore[misc]
        """Fallback JSONResponse."""

        def __init__(self, content: Any):
            self.content = content

    class HTMLResponse:  # type: ignore[misc]
        """Fallback HTMLResponse for offline execution."""

        def __init__(self, content: str, status_code: int = 200):
            self.content = content
            self.status_code = status_code

BASE_DIR = Path(__file__).resolve().parent.parent.parent
SCHEMAS_DIR = BASE_DIR / "schemas"
PALETTE_PATH = BASE_DIR / "ui" / "palette" / "unit_palette.json"
STATIC_INDEX_PATH = BASE_DIR / "ui" / "static" / "index.html"
EXAMPLES_GRAPH_DIR = BASE_DIR / "examples" / "graphs"

app = FastAPI(title="HBD Thermal Flex API", version="0.1.0")


def _load_json_file(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as fp:
        return json.load(fp)


def _load_text_file(path: Path) -> str:
    with path.open("r", encoding="utf-8") as fp:
        return fp.read()


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


@lru_cache(maxsize=1)
def _graph_list() -> Dict[str, Path]:
    graphs: Dict[str, Path] = {}
    if not EXAMPLES_GRAPH_DIR.exists():
        return graphs

    for graph_file in sorted(EXAMPLES_GRAPH_DIR.glob("*.json")):
        graphs[graph_file.stem] = graph_file
    return graphs


@app.get("/", response_class=HTMLResponse)
def serve_index(refresh: bool = False) -> HTMLResponse:
    """Serve the interactive HTML test harness for manual verification."""

    if refresh:
        _graph_list.cache_clear()
    if not STATIC_INDEX_PATH.exists():
        return HTMLResponse("<h1>UI 리소스를 찾을 수 없습니다.</h1>")
    return HTMLResponse(_load_text_file(STATIC_INDEX_PATH))


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


@app.get("/examples/graphs")
def list_example_graphs(refresh: bool = False) -> JSONResponse:
    """Return metadata for the sample PlantGraph definitions bundled with the repo."""

    if refresh:
        _graph_list.cache_clear()

    graphs = [
        {
            "id": graph_id,
            "description": "재열 포함 3압력 CCPP" if graph_id == "ccpp_reheat" else "기본 3압력 CCPP",
        }
        for graph_id in _graph_list().keys()
    ]
    return JSONResponse(content=graphs)


@app.get("/examples/graphs/{graph_id}")
def get_example_graph(graph_id: str, refresh: bool = False) -> Dict[str, Any]:
    """Return a single example PlantGraph JSON payload."""

    if refresh:
        _graph_list.cache_clear()

    graph_path = _graph_list().get(graph_id)
    if graph_path is None:
        raise HTTPException(status_code=404, detail=f"Graph '{graph_id}' not found")
    return _load_json_file(graph_path)


@app.get("/examples/run_case")
def get_example_run_case() -> Dict[str, Any]:
    """Return a representative RunCase payload for quick UI testing."""

    return {
        "mode": "simulate",
        "objective": "max_power",
        "pricing": {"power_USD_MWh": 55, "heat_USD_MWh": 25, "fuel_USD_MMBtu": 8},
        "bounds": {
            "GT1.load_pct": [50, 100],
            "HRSG.hp_sh_out_T_C": [520, 600],
            "COND.vacuum_kPa_abs": [6, 12],
            "DB1.fuel_kg_s": [0, 10],
            "HW1.m_dot_hot_kg_s": [0, 200],
            "DHN.SOC": [0.1, 0.9],
        },
        "constraints": {
            "HRSG.stack_T_min_C": 90,
            "HRSG.pinch_HP_min_K": 10,
            "METAL.max_T_C": 600,
            "DHN.supply_min_C": 110,
            "DHN.return_max_C": 80,
            "DHN.heat_demand_MW": 120,
        },
        "toggles": {"hrh_bypass_on": False},
    }


@app.post("/simulate")
def simulate_plant(request: Dict[str, Any]) -> JSONResponse:
    """Run plant simulation.
    
    Args:
        request: Dictionary containing 'plant_graph' and 'run_case'
        
    Returns:
        Simulation result
    """
    try:
        from hbd.models import PlantGraph, RunCase
        from hbd.engine import PlantEngine
        
        # Parse request
        plant_graph = PlantGraph(**request["plant_graph"])
        run_case = RunCase(**request["run_case"])
        
        # Run simulation
        engine = PlantEngine()
        result = engine.simulate(plant_graph, run_case)
        
        # Return result as JSON
        return JSONResponse(content=result.dict())
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Simulation failed: {str(e)}")


@app.post("/optimize")
def optimize_plant(request: Dict[str, Any]) -> JSONResponse:
    """Run plant optimization.
    
    Args:
        request: Dictionary containing 'plant_graph' and 'run_case'
        
    Returns:
        Optimization result
    """
    try:
        from hbd.models import PlantGraph, RunCase
        from hbd.engine import PlantEngine
        
        # Parse request
        plant_graph = PlantGraph(**request["plant_graph"])
        run_case = RunCase(**request["run_case"])
        
        # Ensure optimization mode
        run_case.mode = "optimize"
        
        # Run optimization
        engine = PlantEngine()
        result = engine.simulate(plant_graph, run_case)
        
        # Return result as JSON
        return JSONResponse(content=result.dict())
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Optimization failed: {str(e)}")


@app.get("/palette/units")
def get_unit_palette(refresh: bool = False) -> Dict[str, Any]:
    """Expose the UI unit palette metadata for client rendering."""

    if refresh:
        _unit_palette.cache_clear()
    palette = _unit_palette()
    return json.loads(json.dumps(palette))


__all__ = ["app", "list_schemas", "get_schema", "get_unit_palette", "simulate_plant", "optimize_plant", "HTTPException"]
