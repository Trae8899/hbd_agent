"""Tests for the intermediate-pressure steam turbine section."""

from __future__ import annotations

import pytest

from hbd.units import SteamTurbineIP, SteamTurbineParams


def test_ip_turbine_port_spec() -> None:
    assert SteamTurbineIP.PortSpec == {
        "inlet": {"medium": "steam"},
        "outlet": {"medium": "steam"},
    }


def test_ip_turbine_shaft_power(steam_case_factory, ambient_conditions) -> None:
    params = SteamTurbineParams(
        eta_isentropic=0.88,
        mech_efficiency=0.99,
        generator_efficiency=0.96,
    )
    turbine = SteamTurbineIP(params)

    delta_h = 140.0
    mass_flow = 130.0
    inputs = steam_case_factory(delta_h=delta_h, mass_flow=mass_flow)

    result = turbine.evaluate(inputs, ambient=ambient_conditions)

    expected_eff = params.eta_isentropic * params.mech_efficiency * params.generator_efficiency
    expected_power = mass_flow * delta_h * expected_eff / 1000.0
    assert result["outlet"]["shaft_power_MW"] == pytest.approx(expected_power)

