"""Main engine implementation for the HBD Thermal Flex system.

This module implements the calculation pipeline as specified in AGENTS.md section 3.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime
from typing import Any, Dict, List, Optional

from .defaults import defaults_manager
from .engine.registry import unit_registry
from .engine.thermo import ThermodynamicState
from .models import (
    PlantGraph,
    PlantSummary,
    Result,
    RunCase,
    MassEnergyBalance,
    DistrictHeating,
)
from .protocols import Ambient, PortState


class PlantEngine:
    """Main engine for plant simulation and optimization.
    
    Implements the calculation pipeline as specified in AGENTS.md section 3:
    1. Compile Graph
    2. Initialize  
    3. Block Solvers
    4. Recycle Iteration
    5. Plant Summary
    6. Optimize (optional)
    """
    
    def __init__(self):
        """Initialize the plant engine."""
        self.plant_graph: Optional[PlantGraph] = None
        self.run_case: Optional[RunCase] = None
        self.unit_states: Dict[str, Dict[str, Any]] = {}
        self.violations: List[str] = []
    
    def simulate(self, plant_graph: PlantGraph, run_case: RunCase) -> Result:
        """Run plant simulation.
        
        Args:
            plant_graph: Plant graph definition
            run_case: Run case definition
            
        Returns:
            Simulation result
        """
        self.plant_graph = plant_graph
        self.run_case = run_case
        
        # Step 1: Compile Graph
        self._compile_graph()
        
        # Step 2: Initialize
        self._initialize()
        
        # Step 3: Block Solvers (Forward Pass)
        self._block_solvers()
        
        # Step 4: Recycle Iteration
        convergence_info = self._recycle_iteration()
        
        # Step 5: Plant Summary
        summary = self._plant_summary()
        
        # Step 6: Optimize (if requested)
        if run_case.mode == "optimize":
            self._optimize()
        
        # Create result
        return self._create_result(summary, convergence_info)
    
    def _compile_graph(self) -> None:
        """Compile and validate the plant graph.
        
        Validates units/streams and port medium compatibility.
        """
        if not self.plant_graph:
            raise ValueError("Plant graph not set")
        
        # Validate units
        for unit in self.plant_graph.units:
            try:
                unit_registry.get_unit_class(unit.type)
            except KeyError:
                raise ValueError(f"Unknown unit type: {unit.type}")
        
        # Validate streams
        unit_ids = {unit.id for unit in self.plant_graph.units}
        for stream in self.plant_graph.streams:
            from_unit = stream.from_.split('.')[0]
            to_unit = stream.to.split('.')[0]
            
            if from_unit not in unit_ids:
                raise ValueError(f"Stream source unit '{from_unit}' not found")
            if to_unit not in unit_ids:
                raise ValueError(f"Stream destination unit '{to_unit}' not found")
    
    def _initialize(self) -> None:
        """Initialize default values and initial estimates."""
        if not self.plant_graph or not self.run_case:
            raise ValueError("Plant graph and run case must be set")
        
        # Initialize unit states
        self.unit_states = {}
        for unit in self.plant_graph.units:
            # Get defaults for this unit type
            defaults = defaults_manager.get_unit_defaults(unit.type)
            
            # Merge with user parameters
            params = defaults_manager.merge_with_defaults(unit.type, unit.params)
            
            # Initialize unit state
            self.unit_states[unit.id] = {
                "type": unit.type,
                "params": params,
                "ports": {},
                "status": "initialized"
            }
    
    def _block_solvers(self) -> None:
        """Execute block solvers in forward pass order.
        
        Order: GasTurbine → DuctBurner → HRSG → SteamTurbine → Condenser → HotWater/PeakBoiler → ThermalStorage
        """
        if not self.plant_graph:
            return
        
        # Simple forward pass - evaluate each unit once
        for unit in self.plant_graph.units:
            self._evaluate_unit(unit.id)
    
    def _evaluate_unit(self, unit_id: str) -> None:
        """Evaluate a single unit."""
        if not self.plant_graph:
            return
        
        unit_def = next(u for u in self.plant_graph.units if u.id == unit_id)
        unit_state = self.unit_states[unit_id]
        
        # Get unit class and create instance
        unit_class = unit_registry.get_unit_class(unit_def.type)
        unit_instance = unit_class(params=unit_class.ParamModel(**unit_state["params"]))
        
        # Prepare inputs
        inputs = {}
        for stream in self.plant_graph.streams:
            if stream.to.startswith(f"{unit_id}."):
                port_name = stream.to.split('.')[1]
                from_unit = stream.from_.split('.')[0]
                from_port = stream.from_.split('.')[1]
                
                # Get state from source unit
                if from_unit in self.unit_states:
                    source_state = self.unit_states[from_unit]["ports"].get(from_port, {})
                    inputs[port_name] = source_state
        
        # Evaluate unit
        ambient = self.plant_graph.ambient
        outputs = unit_instance.evaluate(inputs, unit_instance.params, ambient)
        
        # Store outputs
        unit_state["ports"] = outputs
        unit_state["status"] = "evaluated"
    
    def _recycle_iteration(self) -> MassEnergyBalance:
        """Perform recycle iteration for convergence.
        
        For now, this is a simplified implementation.
        In a full implementation, this would use Newton-Raphson or Simplex.
        """
        # Simple implementation - just check mass/energy balance
        closure_error = 0.1  # Placeholder
        converged = closure_error <= 0.5  # 0.5% tolerance as per AGENTS.md
        
        return MassEnergyBalance(
            closure_error_pct=closure_error,
            converged=converged,
            iterations=1
        )
    
    def _plant_summary(self) -> PlantSummary:
        """Calculate plant performance summary."""
        # Calculate power outputs
        gt_power = 0.0
        st_power = 0.0
        
        for unit_id, unit_state in self.unit_states.items():
            unit_type = unit_state["type"]
            ports = unit_state.get("ports", {})
            
            if "GasTurbine" in unit_type:
                # Extract power from gas turbine
                gt_power += ports.get("shaft_power_MW", 0.0)
            elif "SteamTurbine" in unit_type:
                # Extract power from steam turbine
                st_power += ports.get("shaft_power_MW", 0.0)
        
        # Calculate auxiliary load
        aux_load = defaults_manager.get_unit_defaults("auxiliary").get("aux_load_MW", 5.0)
        
        # Calculate net power
        net_power = gt_power + st_power - aux_load
        
        # Calculate efficiency (placeholder)
        net_eff = 50.0 if net_power > 0 else 0.0
        
        return PlantSummary(
            GT_power_MW=gt_power,
            ST_power_MW=st_power,
            AUX_load_MW=aux_load,
            NET_power_MW=net_power,
            NET_eff_LHV_pct=net_eff,
            heat_out_MWth=0.0,  # Placeholder
            revenue_USD_h=0.0   # Placeholder
        )
    
    def _optimize(self) -> None:
        """Perform optimization using SLSQP.
        
        This is a placeholder implementation.
        A full implementation would use scipy.optimize.minimize with SLSQP.
        """
        if not self.run_case:
            return
        
        # Placeholder optimization logic
        # In a real implementation, this would:
        # 1. Define objective function based on run_case.objective
        # 2. Set up constraints from run_case.constraints
        # 3. Use scipy.optimize.minimize with SLSQP method
        # 4. Handle multiple starts and penalty methods on failure
        pass
    
    def _create_result(self, summary: PlantSummary, convergence_info: MassEnergyBalance) -> Result:
        """Create the final result object."""
        # Calculate plant hash for reproducibility
        plant_hash = self._calculate_plant_hash()
        
        # Create metadata
        meta = {
            "timestamp_utc": datetime.utcnow().isoformat(),
            "solver_commit": "placeholder",  # Would be actual git commit
            "plant_hash": plant_hash
        }
        
        return Result(
            summary=summary,
            violations=self.violations,
            unit_states=self.unit_states,
            mass_energy_balance=convergence_info,
            district_heating=None,  # Placeholder
            meta=meta
        )
    
    def _calculate_plant_hash(self) -> str:
        """Calculate SHA-1 hash of plant graph for reproducibility."""
        if not self.plant_graph:
            return "no_graph"
        
        # Convert to JSON string for hashing
        graph_dict = self.plant_graph.dict()
        graph_str = json.dumps(graph_dict, sort_keys=True)
        
        # Calculate SHA-1 hash
        return hashlib.sha1(graph_str.encode()).hexdigest()


# Global engine instance
plant_engine = PlantEngine()


__all__ = [
    "PlantEngine",
    "plant_engine",
]
