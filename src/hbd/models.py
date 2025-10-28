"""PlantGraph, RunCase, and Result models for the HBD Thermal Flex engine.

These models define the input/output contracts as specified in AGENTS.md.
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, Field

from .protocols import Ambient


class UnitDefinition(BaseModel):
    """Definition of a unit in the plant graph."""
    
    id: str = Field(..., description="Unique identifier for the unit")
    type: str = Field(..., description="Unit type key for plugin registry")
    params: Dict[str, Any] = Field(default_factory=dict, description="Unit-specific parameters")


class StreamDefinition(BaseModel):
    """Definition of a stream connecting two units."""
    
    from_: str = Field(..., alias="from", description="Source port (unit_id.port_name)")
    to: str = Field(..., description="Destination port (unit_id.port_name)")


class PlantGraph(BaseModel):
    """Plant graph definition as specified in AGENTS.md section 2.1."""
    
    meta: Dict[str, Any] = Field(default_factory=lambda: {"version": "1.0"})
    ambient: Ambient = Field(default_factory=Ambient)
    units: List[UnitDefinition] = Field(..., description="List of units in the plant")
    streams: List[StreamDefinition] = Field(..., description="List of streams connecting units")


class Pricing(BaseModel):
    """Pricing information for revenue optimization."""
    
    power_USD_MWh: float = Field(..., description="Power price in USD per MWh")
    heat_USD_MWh: float = Field(..., description="Heat price in USD per MWh") 
    fuel_USD_MMBtu: float = Field(..., description="Fuel price in USD per MMBtu")


class RunCase(BaseModel):
    """Run case definition as specified in AGENTS.md section 2.2."""
    
    mode: Literal["simulate", "optimize"] = Field(..., description="Simulation or optimization mode")
    objective: Literal["max_power", "min_heat_rate", "max_efficiency", "max_revenue"] = Field(
        ..., description="Optimization objective"
    )
    pricing: Optional[Pricing] = Field(None, description="Required for max_revenue objective")
    bounds: Dict[str, List[float]] = Field(default_factory=dict, description="Variable bounds")
    constraints: Dict[str, float] = Field(default_factory=dict, description="Constraint limits")
    toggles: Dict[str, bool] = Field(default_factory=dict, description="Feature toggles")


class PlantSummary(BaseModel):
    """Plant performance summary as specified in AGENTS.md section 2.3."""
    
    GT_power_MW: float = Field(0.0, description="Gas turbine power output in MW")
    ST_power_MW: float = Field(0.0, description="Steam turbine power output in MW")
    AUX_load_MW: float = Field(0.0, description="Auxiliary load in MW")
    NET_power_MW: float = Field(0.0, description="Net power output in MW")
    NET_eff_LHV_pct: float = Field(0.0, description="Net LHV efficiency percentage")
    heat_out_MWth: float = Field(0.0, description="Heat output in MW thermal")
    revenue_USD_h: float = Field(0.0, description="Revenue per hour in USD")


class MassEnergyBalance(BaseModel):
    """Mass and energy balance convergence information."""
    
    closure_error_pct: float = Field(..., description="Mass/energy closure error percentage")
    converged: bool = Field(..., description="Whether the solution converged")
    iterations: int = Field(..., description="Number of iterations required")


class DistrictHeating(BaseModel):
    """District heating system state."""
    
    DHN_SOC: float = Field(..., description="Thermal storage state of charge")
    heat_supply_C: float = Field(..., description="Heat supply temperature in Celsius")
    heat_return_C: float = Field(..., description="Heat return temperature in Celsius")


class Result(BaseModel):
    """Result object as specified in AGENTS.md section 2.3."""
    
    summary: PlantSummary = Field(..., description="Plant performance summary")
    violations: List[str] = Field(default_factory=list, description="Constraint violations")
    unit_states: Dict[str, Dict[str, Any]] = Field(default_factory=dict, description="Unit states")
    mass_energy_balance: MassEnergyBalance = Field(..., description="Convergence information")
    district_heating: Optional[DistrictHeating] = Field(None, description="District heating state")
    meta: Dict[str, str] = Field(default_factory=dict, description="Metadata (timestamp, commit, hash)")


__all__ = [
    "UnitDefinition",
    "StreamDefinition", 
    "PlantGraph",
    "Pricing",
    "RunCase",
    "PlantSummary",
    "MassEnergyBalance",
    "DistrictHeating",
    "Result",
]
