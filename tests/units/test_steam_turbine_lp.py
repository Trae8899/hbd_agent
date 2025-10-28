"""Tests for the low-pressure steam turbine section."""

from __future__ import annotations

import pytest

from hbd.units import SteamTurbineLP, SteamTurbineParams


def test_lp_turbine_outlet_defaults(ambient_conditions) -> None:
    params = SteamTurbineParams()
    turbine = SteamTurbineLP(params)

    inputs = {
        "inlet": {
            "T_C": 350.0,
            "P_kPa_abs": 15.0,
            "h_kJ_kg": 2600.0,
            "m_dot_kg_s": 90.0,
            "medium": "steam",
        }
    }
    result = turbine.evaluate(inputs, ambient=ambient_conditions)

    assert result["outlet"]["medium"] == "steam"
    assert result["outlet"]["shaft_power_MW"] == pytest.approx(0.0)


def test_lp_turbine_shaft_power(steam_case_factory, ambient_conditions) -> None:
    params = SteamTurbineParams(
        eta_isentropic=0.86,
        mech_efficiency=0.97,
        generator_efficiency=0.985,
    )
    turbine = SteamTurbineLP(params)

    delta_h = 60.0
    mass_flow = 200.0
    inputs = steam_case_factory(delta_h=delta_h, mass_flow=mass_flow)

    result = turbine.evaluate(inputs, ambient=ambient_conditions)

    expected_eff = params.eta_isentropic * params.mech_efficiency * params.generator_efficiency
    expected_power = mass_flow * delta_h * expected_eff / 1000.0
    assert result["outlet"]["shaft_power_MW"] == pytest.approx(expected_power)

