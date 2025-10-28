export type Medium = "gas" | "steam" | "water" | "hot_water" | "fuel_gas";

export interface PalettePort {
  medium: Medium;
  direction: "in" | "out";
}

export interface PaletteUnit {
  type: string;
  label: string;
  icon?: string;
  category?: string;
  tags?: string[];
  ports: Record<string, PalettePort>;
  defaults: Record<string, unknown>;
}

export interface UnitPaletteResponse {
  units: PaletteUnit[];
}

export interface GraphNode {
  id: string;
  type: string;
  label: string;
  position: { x: number; y: number };
  params: Record<string, unknown>;
  ports: Record<string, PalettePort>;
}

export interface PortReference {
  nodeId: string;
  portId: string;
}

export interface GraphEdge {
  id: string;
  from: PortReference;
  to: PortReference;
  medium: Medium;
}

export interface GraphState {
  nodes: GraphNode[];
  edges: GraphEdge[];
  ambient?: Record<string, unknown>;
}

export interface PlantGraphStream {
  from: string;
  to: string;
}

export interface PlantGraphUnit {
  id: string;
  type: string;
  params: Record<string, unknown>;
}

export interface PlantGraph {
  meta?: Record<string, unknown>;
  ambient?: Record<string, unknown>;
  units: PlantGraphUnit[];
  streams: PlantGraphStream[];
}

export interface RunCase {
  mode: "simulate" | "optimize";
  objective: string;
  pricing?: Record<string, unknown>;
  bounds?: Record<string, [number, number]>;
  constraints?: Record<string, number>;
  toggles?: Record<string, boolean>;
}

export interface SimulationResult {
  summary?: Record<string, unknown>;
  violations?: string[];
  district_heating?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  [key: string]: unknown;
}
