"""Steam turbine unit definitions for the HBD runtime.

The actual thermodynamic solver is provided by the host application.  This
module contains lightweight parameter models and placeholder evaluate methods
so the plugin registry can instantiate the units during integration tests.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, ClassVar, Dict, Mapping, MutableMapping, Type

__all__ = [
    "SteamTurbineParams",
    "SteamTurbineBase",
    "SteamTurbineHP",
    "SteamTurbineIP",
    "SteamTurbineLP",
    "SteamTurbineIPLP",
]


@dataclass(slots=True)
class SteamTurbineParams:
    """Shared parameter model for steam turbine sections."""

    eta_isentropic: float = 0.88
    mech_efficiency: float = 0.985
    generator_efficiency: float = 0.985
    min_flow_kg_s: float | None = None
    max_flow_kg_s: float | None = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        """Validate numeric ranges eagerly to mimic pydantic behaviour."""

        for name in ("eta_isentropic", "mech_efficiency", "generator_efficiency"):
            value = getattr(self, name)
            if not 0.0 <= value <= 1.0:
                raise ValueError(f"{name} must lie in [0, 1], received {value!r}")

        if self.min_flow_kg_s is not None and self.min_flow_kg_s < 0:
            raise ValueError("min_flow_kg_s must be non-negative")
        if self.max_flow_kg_s is not None and self.max_flow_kg_s < 0:
            raise ValueError("max_flow_kg_s must be non-negative")
        if (
            self.min_flow_kg_s is not None
            and self.max_flow_kg_s is not None
            and self.max_flow_kg_s < self.min_flow_kg_s
        ):
            raise ValueError("max_flow_kg_s must be greater than or equal to min_flow_kg_s")

    def dict(self) -> Dict[str, Any]:
        """Return a mapping representation comparable to pydantic models."""

        return {
            "eta_isentropic": self.eta_isentropic,
            "mech_efficiency": self.mech_efficiency,
            "generator_efficiency": self.generator_efficiency,
            "min_flow_kg_s": self.min_flow_kg_s,
            "max_flow_kg_s": self.max_flow_kg_s,
            "metadata": dict(self.metadata),
        }


class SteamTurbineBase:
    """Common behaviour shared by all steam turbine sections."""

    type_key: ClassVar[str] = "SteamTurbine"
    ParamModel: ClassVar[Type[SteamTurbineParams]] = SteamTurbineParams
    PortSpec: ClassVar[Dict[str, Dict[str, str]]] = {
        "inlet": {"medium": "steam"},
        "outlet": {"medium": "steam"},
    }

    def __init__(self, params: SteamTurbineParams | None = None) -> None:
        self.params = params or self.ParamModel()

    def evaluate(
        self,
        inputs: Mapping[str, Mapping[str, Any]],
        ambient: Mapping[str, Any] | None = None,
    ) -> Dict[str, MutableMapping[str, Any]]:
        """Return a placeholder evaluation result.

        The placeholder simply propagates the inlet state to the outlet so that
        integration tests have a consistent data structure until the
        thermodynamic hooks are connected.  Concrete implementations are
        expected to replace this logic with the actual turbine expansion model.
        """

        del ambient  # Ambient conditions will be used by the real implementation.

        outputs: Dict[str, MutableMapping[str, Any]] = {
            port: dict(state) for port, state in inputs.items()
        }

        inlet_state = inputs.get("inlet")
        outlet_state = inputs.get("outlet") or inlet_state

        if "outlet" not in outputs and inlet_state is not None:
            outputs["outlet"] = dict(inlet_state)

        medium = outputs["outlet"].setdefault("medium", "steam")
        if medium != "steam":
            outputs["outlet"]["medium"] = "steam"

        shaft_power_mw = 0.0
        if inlet_state and outlet_state:
            h_in = inlet_state.get("h_kJ_kg")
            h_out = outlet_state.get("h_kJ_kg")
            m_dot = (
                outlet_state.get("m_dot_kg_s")
                or inlet_state.get("m_dot_kg_s")
            )
            if (
                isinstance(h_in, (int, float))
                and isinstance(h_out, (int, float))
                and isinstance(m_dot, (int, float))
            ):
                delta_h = max(h_in - h_out, 0.0)
                efficiency = max(
                    0.0,
                    min(
                        1.0,
                        self.params.eta_isentropic
                        * self.params.mech_efficiency
                        * self.params.generator_efficiency,
                    ),
                )
                shaft_power_mw = m_dot * delta_h * efficiency / 1000.0

        outputs["outlet"]["shaft_power_MW"] = shaft_power_mw
        return outputs


class SteamTurbineHP(SteamTurbineBase):
    """High-pressure steam turbine section."""

    type_key: ClassVar[str] = "SteamTurbineHP"


class SteamTurbineIP(SteamTurbineBase):
    """Intermediate-pressure steam turbine section."""

    type_key: ClassVar[str] = "SteamTurbineIP"


class SteamTurbineLP(SteamTurbineBase):
    """Low-pressure steam turbine section."""

    type_key: ClassVar[str] = "SteamTurbineLP"


class SteamTurbineIPLP(SteamTurbineBase):
    """Combined IP/LP section kept for backward compatibility."""

    type_key: ClassVar[str] = "SteamTurbineIPLP"
