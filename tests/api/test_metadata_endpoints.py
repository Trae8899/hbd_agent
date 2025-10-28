from api.app import HTTPException, get_schema, get_unit_palette, list_schemas


def test_list_schemas_exposes_steam_turbines():
    schemas = list_schemas(refresh=True)
    assert "SteamTurbineHP" in schemas
    assert "SteamTurbineIP" in schemas
    assert schemas["SteamTurbineLP"]["properties"]["eta_isentropic"]["default"] == 0.88


def test_get_schema_not_found():
    try:
        get_schema("UnknownTurbine", refresh=True)
    except HTTPException as exc:
        assert exc.status_code == 404
        assert "UnknownTurbine" in exc.detail
    else:  # pragma: no cover - defensive guard
        raise AssertionError("Expected HTTPException for unknown schema")


def test_unit_palette_contains_all_sections():
    palette = get_unit_palette(refresh=True)
    unit_types = {entry["type"] for entry in palette.get("units", [])}
    assert {"SteamTurbineHP", "SteamTurbineIP", "SteamTurbineLP", "SteamTurbineIPLP"}.issubset(unit_types)
