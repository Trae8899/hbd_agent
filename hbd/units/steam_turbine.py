"""Steam turbine unit placeholders for plugin registration.

These classes exist to provide stable import locations for the plugin
entry-points that the runtime discovers via ``hbd.units``.
"""

from __future__ import annotations

from typing import Any, Dict

__all__ = [
    "SteamTurbineBase",
    "SteamTurbineHP",
    "SteamTurbineIP",
    "SteamTurbineLP",
    "SteamTurbineIPLP",
]


class SteamTurbineBase:
    """Common interface for steam turbine units.

    The actual solver implementation is provided by the runtime.  The
    placeholder exists so that entry-point discovery succeeds even when the
    heavy simulation stack is not yet linked in the repository.
    """

    type_key: str = "SteamTurbine"

    def evaluate(
        self, inputs: Dict[str, Any], params: Dict[str, Any] | None = None, ambient: Dict[str, Any] | None = None
    ) -> Dict[str, Any]:
        """Evaluate the turbine performance.

        Implementations must override this method to provide the actual
        thermodynamic calculations.  The default implementation raises an
        error to make the contract explicit during development.
        """

        raise NotImplementedError("SteamTurbineBase.evaluate must be implemented by concrete classes")


class SteamTurbineHP(SteamTurbineBase):
    """High-pressure section of the steam turbine train."""

    type_key = "SteamTurbineHP"


class SteamTurbineIP(SteamTurbineBase):
    """Intermediate-pressure section of the steam turbine train."""

    type_key = "SteamTurbineIP"


class SteamTurbineLP(SteamTurbineBase):
    """Low-pressure section of the steam turbine train."""

    type_key = "SteamTurbineLP"


class SteamTurbineIPLP(SteamTurbineBase):
    """Combined IP/LP model kept for backward compatibility."""

    type_key = "SteamTurbineIPLP"
