"""Core protocols and interfaces for the HBD Thermal Flex engine.

This module defines the fundamental interfaces that all units must implement
according to the AGENTS.md specification.
"""

from __future__ import annotations

from typing import Any, ClassVar, Dict, Mapping, Protocol, Type

try:
    from pydantic import BaseModel
except ImportError:  # pragma: no cover - fallback for test environments
    class BaseModel:  # type: ignore[misc]
        """Fallback BaseModel for environments without pydantic."""
        pass


class Ambient(BaseModel):
    """Ambient conditions for thermodynamic calculations.
    
    All values use absolute pressure and SI units as specified in AGENTS.md.
    """
    
    T_C: float = 30.0  # Ambient temperature in Celsius
    RH_pct: float = 60.0  # Relative humidity percentage
    P_kPa_abs: float = 101.3  # Ambient pressure in kPa absolute


class PortState(BaseModel):
    """Standard port state schema for all units.
    
    All thermodynamic properties use absolute pressure and SI units.
    Variable names include suffixes like _abs, _kPa_abs as specified in AGENTS.md.
    """
    
    T_C: float  # Temperature in Celsius
    P_kPa_abs: float  # Pressure in kPa absolute
    h_kJ_kg: float  # Specific enthalpy in kJ/kg
    m_dot_kg_s: float  # Mass flow rate in kg/s
    medium: str  # Medium type: gas, steam, water, hot_water, fuel_gas


class UnitBase(Protocol):
    """Base protocol that all units must implement.
    
    This protocol defines the interface for the plugin registry system
    as specified in AGENTS.md section 4.
    """
    
    type_key: ClassVar[str]
    ParamModel: Type[BaseModel]
    PortSpec: ClassVar[Dict[str, Dict[str, str]]]
    
    def evaluate(
        self, 
        inputs: Dict[str, Dict[str, Any]], 
        params: BaseModel, 
        ambient: Ambient
    ) -> Dict[str, Dict[str, Any]]:
        """Evaluate unit performance given input conditions.
        
        Args:
            inputs: Dictionary mapping port names to port states
            params: Unit-specific parameters
            ambient: Ambient conditions
            
        Returns:
            Dictionary mapping output port names to port states
            
        The inputs and outputs follow the same schema:
        {port_name: {T_C, P_kPa_abs, h_kJ_kg, m_dot_kg_s, medium}}
        """
        ...


def register_unit(unit_class: Type[UnitBase]) -> None:
    """Register a unit class in the global registry.
    
    This function allows units to be discovered and instantiated
    by the engine runtime.
    """
    # Implementation will be added when the registry system is built
    pass


__all__ = [
    "Ambient",
    "PortState", 
    "UnitBase",
    "register_unit",
]
