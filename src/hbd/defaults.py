"""Default values and constraints system for the HBD Thermal Flex engine.

This module implements the defaults system as specified in AGENTS.md section 6.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict

from .protocols import Ambient


class DefaultsManager:
    """Manages default values and constraints for the engine.
    
    Loads defaults from defaults/defaults.json and provides conservative
    fallback values as specified in AGENTS.md.
    """
    
    def __init__(self, defaults_path: Path | None = None):
        """Initialize the defaults manager.
        
        Args:
            defaults_path: Path to defaults.json file. If None, uses default location.
        """
        if defaults_path is None:
            defaults_path = Path(__file__).parent.parent.parent / "defaults" / "defaults.json"
        
        self.defaults_path = defaults_path
        self._defaults: Dict[str, Any] = {}
        self._load_defaults()
    
    def _load_defaults(self) -> None:
        """Load defaults from the JSON file."""
        if self.defaults_path.exists():
            with self.defaults_path.open("r", encoding="utf-8") as f:
                self._defaults = json.load(f)
        else:
            # Use hardcoded defaults if file doesn't exist
            self._defaults = self._get_hardcoded_defaults()
    
    def _get_hardcoded_defaults(self) -> Dict[str, Any]:
        """Get hardcoded defaults as specified in AGENTS.md section 6."""
        return {
            "ambient": {
                "T_C": 30.0,
                "RH_pct": 60.0,
                "P_kPa_abs": 101.3
            },
            "steam_turbine": {
                "eta_isentropic": 0.88,
                "mech_efficiency": 0.985,
                "generator_efficiency": 0.985
            },
            "hrsg": {
                "pinch_HP_K": 10.0,
                "approach_HP_K": 5.0,
                "pinch_IP_K": 12.0,
                "pinch_LP_K": 15.0,
                "stack_T_min_C": 90.0
            },
            "condenser": {
                "cw_in_C": 20.0,
                "cw_out_max_C": 28.0,
                "vacuum_kPa_abs": 8.0
            },
            "auxiliary": {
                "aux_load_MW": 5.0
            },
            "duct_burner": {
                "excess_O2_pct": 3.0,
                "target_T_C": 925.0  # Mid-range of 900-950°C
            },
            "district_heating": {
                "supply_set_C": 120.0,
                "return_target_C": 70.0,
                "SOC_init": 0.5
            },
            "constraints": {
                "METAL_max_T_C": 600.0,
                "DHN_supply_min_C": 110.0,
                "DHN_return_max_C": 80.0
            }
        }
    
    def get_ambient_defaults(self) -> Ambient:
        """Get default ambient conditions."""
        ambient_data = self._defaults.get("ambient", {})
        return Ambient(**ambient_data)
    
    def get_unit_defaults(self, unit_type: str) -> Dict[str, Any]:
        """Get default parameters for a specific unit type."""
        return self._defaults.get(unit_type, {}).copy()
    
    def get_constraint_defaults(self) -> Dict[str, float]:
        """Get default constraint values."""
        return self._defaults.get("constraints", {}).copy()
    
    def merge_with_defaults(self, unit_type: str, user_params: Dict[str, Any]) -> Dict[str, Any]:
        """Merge user parameters with defaults conservatively.
        
        Args:
            unit_type: Type of unit (e.g., 'steam_turbine', 'hrsg')
            user_params: User-provided parameters
            
        Returns:
            Merged parameters with defaults filling missing values
        """
        defaults = self.get_unit_defaults(unit_type)
        merged = defaults.copy()
        merged.update(user_params)
        return merged


# Global defaults manager instance
defaults_manager = DefaultsManager()


__all__ = [
    "DefaultsManager",
    "defaults_manager",
]
