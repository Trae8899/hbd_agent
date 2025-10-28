"""Shared pytest fixtures for unit tests."""

from __future__ import annotations

import sys
from collections.abc import Callable
from pathlib import Path
from typing import Any, Mapping

import pytest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_PATH = PROJECT_ROOT / "src"
if str(SRC_PATH) not in sys.path:
    sys.path.insert(0, str(SRC_PATH))


@pytest.fixture
def ambient_conditions() -> Mapping[str, Any]:
    """Representative ambient conditions used across unit tests."""

    return {"T_C": 25.0, "P_kPa_abs": 101.3, "RH_pct": 50.0}


@pytest.fixture
def steam_case_factory() -> Callable[[float, float], Mapping[str, Mapping[str, Any]]]:
    """Build input dictionaries for steam turbine sections."""

    def _factory(delta_h: float, mass_flow: float) -> Mapping[str, Mapping[str, Any]]:
        inlet_state = {
            "T_C": 540.0,
            "P_kPa_abs": 15000.0,
            "h_kJ_kg": 3200.0,
            "m_dot_kg_s": mass_flow,
            "medium": "steam",
        }
        outlet_state = {
            "T_C": 420.0,
            "P_kPa_abs": 900.0,
            "h_kJ_kg": 3200.0 - delta_h,
            "m_dot_kg_s": mass_flow,
            "medium": "steam",
        }
        return {"inlet": inlet_state, "outlet": outlet_state}

    return _factory

