"""Tests for the high-pressure steam turbine section."""

from __future__ import annotations

import pytest

from hbd.units import SteamTurbineHP, SteamTurbineParams


def test_hp_turbine_port_structure(steam_case_factory, ambient_conditions) -> None:
    params = SteamTurbineParams(eta_isentropic=0.9)
    turbine = SteamTurbineHP(params)

    inputs = steam_case_factory(delta_h=180.0, mass_flow=120.0)
    result = turbine.evaluate(inputs, ambient=ambient_conditions)

    assert set(result.keys()) >= {"inlet", "outlet"}
    assert result["outlet"]["medium"] == "steam"


def test_hp_turbine_shaft_power(steam_case_factory, ambient_conditions) -> None:
    params = SteamTurbineParams(
        eta_isentropic=0.9,
        mech_efficiency=0.98,
        generator_efficiency=0.97,
    )
    turbine = SteamTurbineHP(params)

    delta_h = 220.0
    mass_flow = 115.0
    inputs = steam_case_factory(delta_h=delta_h, mass_flow=mass_flow)

    result = turbine.evaluate(inputs, ambient=ambient_conditions)

    expected_eff = params.eta_isentropic * params.mech_efficiency * params.generator_efficiency
    expected_power = mass_flow * delta_h * expected_eff / 1000.0
    assert result["outlet"]["shaft_power_MW"] == pytest.approx(expected_power)

