import { enableMapSet } from 'immer';

enableMapSet();

export type Medium = 'gas' | 'steam' | 'water' | 'hot_water' | 'fuel_gas';

export interface PalettePort {
  medium: Medium;
  direction: 'in' | 'out';
}

export interface PaletteUnit {
  type: string;
  label: string;
  icon: string;
  category: string;
  tags: string[];
  ports: Record<string, PalettePort>;
  defaults: Record<string, unknown>;
}

export interface GraphPort {
  id: string;
  key: string;
  medium: Medium;
  direction: 'in' | 'out';
}

export interface GraphNode {
  id: string;
  type: string;
  label: string;
  position: { x: number; y: number };
  params: Record<string, unknown>;
  ports: GraphPort[];
}

export interface PortRef {
  nodeId: string;
  portId: string;
}

export interface GraphEdge {
  id: string;
  from: PortRef;
  to: PortRef;
  medium: Medium;
}

export interface PlantGraph {
  units: Array<{
    id: string;
    type: string;
    params: Record<string, unknown>;
  }>;
  streams: Array<{
    from: string;
    to: string;
  }>;
  ambient?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

export interface RunCase {
  mode: 'simulate' | 'optimize';
  objective: 'max_power' | 'min_heat_rate' | 'max_efficiency' | 'max_revenue';
  pricing?: Record<string, number>;
  bounds?: Record<string, [number, number]>;
  constraints?: Record<string, number>;
  toggles?: Record<string, boolean>;
}

export interface DesignerState {
  palette: PaletteUnit[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  runCase: RunCase;
  autoRun: boolean;
  lastRunResult: unknown | null;
  selectedNodeId: string | null;
  isLoading: boolean;
  error?: string;
}

export const MEDIUM_COLORS: Record<Medium, string> = {
  gas: '#d0463b',
  steam: '#2d6cdf',
  water: '#2d6cdf',
  hot_water: '#f97316',
  fuel_gas: '#4b5563'
};

export const DEFAULT_STATE: DesignerState = {
  palette: [],
  nodes: [],
  edges: [],
  runCase: {
    mode: 'simulate',
    objective: 'max_efficiency'
  },
  autoRun: true,
  lastRunResult: null,
  selectedNodeId: null,
  isLoading: false
};

export interface SerializedEdge {
  from: string;
  to: string;
}

export function serializeGraph(state: DesignerState): PlantGraph {
  const units = state.nodes.map((node) => ({
    id: node.id,
    type: node.type,
    params: node.params
  }));

  const streams = state.edges.map((edge) => ({
    from: `${edge.from.nodeId}.${edge.from.portId}`,
    to: `${edge.to.nodeId}.${edge.to.portId}`
  }));

  return {
    meta: { version: '1.0', generated_at: new Date().toISOString() },
    units,
    streams
  };
}

export function applyGraphImport(
  state: DesignerState,
  graph: PlantGraph,
  palette: PaletteUnit[]
): DesignerState {
  const paletteByType = new Map(palette.map((unit) => [unit.type, unit]));

  const nodes: GraphNode[] = graph.units.map((unit, index) => {
    const spec = paletteByType.get(unit.type);
    const basePorts = spec
      ? Object.entries(spec.ports).map(([key, port]) => ({
          id: `${unit.id}.${key}`,
          key,
          medium: port.medium,
          direction: port.direction
        }))
      : [];

    return {
      id: unit.id,
      type: unit.type,
      label: spec?.label ?? unit.type,
      position: {
        x: 200 + (index % 4) * 220,
        y: 150 + Math.floor(index / 4) * 160
      },
      params: unit.params ?? {},
      ports: basePorts
    };
  });

  const edges: GraphEdge[] = graph.streams
    .map((stream, index) => {
      const [fromNodeId, fromPortId] = stream.from.split('.');
      const [toNodeId, toPortId] = stream.to.split('.');
      const fromNode = nodes.find((node) => node.id === fromNodeId);
      const toNode = nodes.find((node) => node.id === toNodeId);
      if (!fromNode || !toNode) {
        return null;
      }
      const fromPort = fromNode.ports.find((port) => port.id === stream.from);
      const toPort = toNode.ports.find((port) => port.id === stream.to);
      const medium = fromPort?.medium ?? toPort?.medium ?? 'steam';
      return {
        id: `edge-${index}`,
        from: {
          nodeId: fromNodeId,
          portId: fromPortId
        },
        to: {
          nodeId: toNodeId,
          portId: toPortId
        },
        medium
      };
    })
    .filter((edge): edge is GraphEdge => edge !== null);

  return {
    ...state,
    nodes,
    edges
  };
}
