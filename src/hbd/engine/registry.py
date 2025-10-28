"""Unit registry and plugin system for the HBD Thermal Flex engine.

This module implements the plugin registry system as specified in AGENTS.md section 4.
"""

from __future__ import annotations

import importlib
import pkgutil
from typing import Any, Dict, Type

from ..protocols import UnitBase


class UnitRegistry:
    """Registry for unit plugins with automatic discovery.
    
    Supports both manual registration and entry_points discovery
    as specified in AGENTS.md.
    """
    
    def __init__(self):
        """Initialize the unit registry."""
        self._units: Dict[str, Type[UnitBase]] = {}
        self._discovered = False
    
    def register_unit(self, unit_class: Type[UnitBase]) -> None:
        """Register a unit class manually.
        
        Args:
            unit_class: Unit class implementing UnitBase protocol
        """
        type_key = unit_class.type_key
        if type_key in self._units:
            raise ValueError(f"Unit type '{type_key}' is already registered")
        
        self._units[type_key] = unit_class
    
    def discover_units(self) -> None:
        """Discover units from entry_points and package imports."""
        if self._discovered:
            return
        
        # Discover from entry_points
        try:
            import pkg_resources
            for entry_point in pkg_resources.iter_entry_points("hbd.units"):
                try:
                    unit_class = entry_point.load()
                    self.register_unit(unit_class)
                except Exception as e:
                    print(f"Warning: Failed to load unit {entry_point.name}: {e}")
        except ImportError:
            # pkg_resources not available, skip entry_points discovery
            pass
        
        # Discover from package imports
        self._discover_from_package()
        
        self._discovered = True
    
    def _discover_from_package(self) -> None:
        """Discover units by importing from the hbd.units package."""
        try:
            from .. import units
            
            # Import all modules in the units package
            for importer, modname, ispkg in pkgutil.iter_modules(units.__path__, units.__name__ + "."):
                try:
                    module = importlib.import_module(modname)
                    
                    # Look for classes that implement UnitBase
                    for attr_name in dir(module):
                        attr = getattr(module, attr_name)
                        if (isinstance(attr, type) and 
                            issubclass(attr, UnitBase) and 
                            attr is not UnitBase):
                            self.register_unit(attr)
                except Exception as e:
                    print(f"Warning: Failed to import module {modname}: {e}")
        except ImportError:
            # Units package not available
            pass
    
    def get_unit_class(self, type_key: str) -> Type[UnitBase]:
        """Get a unit class by type key.
        
        Args:
            type_key: Unit type key
            
        Returns:
            Unit class
            
        Raises:
            KeyError: If unit type is not registered
        """
        if not self._discovered:
            self.discover_units()
        
        if type_key not in self._units:
            raise KeyError(f"Unit type '{type_key}' not found in registry")
        
        return self._units[type_key]
    
    def list_unit_types(self) -> list[str]:
        """List all registered unit types.
        
        Returns:
            List of unit type keys
        """
        if not self._discovered:
            self.discover_units()
        
        return list(self._units.keys())
    
    def create_unit(self, type_key: str, params: Dict[str, Any]) -> UnitBase:
        """Create a unit instance.
        
        Args:
            type_key: Unit type key
            params: Unit parameters
            
        Returns:
            Unit instance
        """
        unit_class = self.get_unit_class(type_key)
        
        # Create parameter model instance
        param_model = unit_class.ParamModel(**params)
        
        # Create unit instance
        return unit_class(params=param_model)


# Global registry instance
unit_registry = UnitRegistry()


__all__ = [
    "UnitRegistry",
    "unit_registry",
]
