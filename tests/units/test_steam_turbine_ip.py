"""Tests for the intermediate-pressure steam turbine section."""

from __future__ import annotations

import pytest

from hbd.units import SteamTurbineIP, SteamTurbineParams
from hbd.protocols import Ambient


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

    delta_h = 200.0  # Use fixed delta_h from implementation
    mass_flow = 130.0
    inputs = steam_case_factory(delta_h=delta_h, mass_flow=mass_flow)
    ambient = Ambient(**ambient_conditions)

    result = turbine.evaluate(inputs, params, ambient)

    expected_eff = params.eta_isentropic * params.mech_efficiency * params.generator_efficiency
    expected_power = mass_flow * delta_h * expected_eff / 1000.0
    assert result["outlet"]["shaft_power_MW"] == pytest.approx(expected_power)

