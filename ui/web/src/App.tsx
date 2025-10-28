import { useEffect, useMemo, useState } from "react";
import { nanoid } from "nanoid";
import { fetchGraphExample, fetchPalette, fetchRunCaseExample, optimizePlant, simulatePlant } from "./api";
import { GraphCanvas } from "./components/GraphCanvas";
import { InspectorPanel } from "./components/InspectorPanel";
import { PaletteSidebar } from "./components/PaletteSidebar";
import { ParameterDialog } from "./components/ParameterDialog";
import { useAutoRun } from "./hooks/useAutoRun";
import {
  GraphEdge,
  GraphNode,
  GraphState,
  PaletteUnit,
  PortReference,
  RunCase,
  SimulationResult
} from "./types/graph";
import { buildRunPayload, plantToGraph } from "./utils/graphSerializer";

const DEFAULT_RUN_CASE: RunCase = {
  mode: "simulate",
  objective: "max_power",
  pricing: { power_USD_MWh: 55, heat_USD_MWh: 25, fuel_USD_MMBtu: 8 }
};

function buildPaletteIndex(palette: PaletteUnit[]) {
  return new Map(palette.map((unit) => [unit.type, unit]));
}

function createNodeId(type: string, existing: GraphNode[]): string {
  const base = type.replace(/[^a-zA-Z0-9]+/g, "_");
  let index = 1;
  while (existing.some((node) => node.id === `${base}_${index}`)) {
    index += 1;
  }
  return `${base}_${index}`;
}

export default function App() {
  const [palette, setPalette] = useState<PaletteUnit[]>([]);
  const paletteIndex = useMemo(() => buildPaletteIndex(palette), [palette]);
  const [graph, setGraph] = useState<GraphState>({ nodes: [], edges: [], ambient: { T_C: 30, RH_pct: 60, P_kPa_abs: 101.3 } });
  const [runCase, setRunCase] = useState<RunCase>(DEFAULT_RUN_CASE);
  const [, setSelectedNodeId] = useState<string | null>(null);
  const [parameterTarget, setParameterTarget] = useState<GraphNode | null>(null);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPalette()
      .then((response) => setPalette(response.units))
      .catch((err) => setError(err.message));
  }, []);

  const handleDropUnit = (unit: PaletteUnit, position: { x: number; y: number }) => {
    setGraph((prev) => {
      const id = createNodeId(unit.type, prev.nodes);
      const node: GraphNode = {
        id,
        type: unit.type,
        label: id,
        params: { ...unit.defaults },
        position,
        ports: unit.ports
      };
      return {
        ...prev,
        nodes: [...prev.nodes, node]
      };
    });
  };

  const handleNodePositionChange = (nodeId: string, position: { x: number; y: number }) => {
    setGraph((prev) => ({
      ...prev,
      nodes: prev.nodes.map((node) => (node.id === nodeId ? { ...node, position } : node))
    }));
  };

  const handleEdgeCreate = (from: PortReference, to: PortReference, medium: GraphEdge["medium"]) => {
    setGraph((prev) => {
      const exists = prev.edges.some(
        (edge) =>
          edge.from.nodeId === from.nodeId &&
          edge.from.portId === from.portId &&
          edge.to.nodeId === to.nodeId &&
          edge.to.portId === to.portId
      );
      if (exists) {
        return prev;
      }
      const edge: GraphEdge = {
        id: nanoid(),
        from,
        to,
        medium
      };
      return {
        ...prev,
        edges: [...prev.edges, edge]
      };
    });
  };

  const handleEdgeRemove = (edgeId: string) => {
    setGraph((prev) => ({
      ...prev,
      edges: prev.edges.filter((edge) => edge.id !== edgeId)
    }));
  };

  const handleNodeParamsRequest = (nodeId: string) => {
    const node = graph.nodes.find((item) => item.id === nodeId);
    if (node) {
      setParameterTarget(node);
    }
  };

  const handleNodeParamsSave = (nodeId: string, params: Record<string, unknown>) => {
    setGraph((prev) => ({
      ...prev,
      nodes: prev.nodes.map((node) => (node.id === nodeId ? { ...node, params } : node))
    }));
  };

  const runSimulation = async () => {
    setIsBusy(true);
    setError(null);
    try {
      const payload = buildRunPayload(graph, { ...runCase, mode: "simulate" });
      const response = await simulatePlant(payload);
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsBusy(false);
    }
  };

  const runOptimization = async () => {
    setIsBusy(true);
    setError(null);
    try {
      const payload = buildRunPayload(graph, { ...runCase, mode: "optimize" });
      const response = await optimizePlant(payload);
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsBusy(false);
    }
  };

  useAutoRun(() => {
    if (graph.nodes.length > 0 && runCase.mode === "simulate" && !isBusy) {
      runSimulation();
    }
  }, [graph, runCase.mode, runCase.objective, isBusy]);

  const handleLoadGraphExample = async (name: string) => {
    try {
      const plant = await fetchGraphExample(name);
      const portMap = new Map<string, GraphNode["ports"]>();
      palette.forEach((unit) => {
        portMap.set(unit.type, unit.ports);
      });
      const nextGraph = plantToGraph(plant, portMap);
      setGraph(nextGraph);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleLoadRunCaseExample = async (name: string) => {
    try {
      const run = await fetchRunCaseExample(name);
      setRunCase(run);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <div style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "#96a8bf" }}>
            HBD Thermal Flex
          </div>
          <div style={{ fontWeight: 700, fontSize: "1.1rem" }}>Graph-based plant editor</div>
        </div>
        <div style={{ fontSize: "0.85rem", color: error ? "#d93025" : "#6b829f" }}>
          {error ? error : result ? "Auto-run ready" : "Drag units to begin"}
        </div>
      </header>
      <PaletteSidebar palette={palette} />
      <GraphCanvas
        graph={graph}
        paletteIndex={paletteIndex}
        onNodePositionChange={handleNodePositionChange}
        onNodeParamsRequest={handleNodeParamsRequest}
        onEdgeCreate={handleEdgeCreate}
        onNodeSelect={setSelectedNodeId}
        onEdgeRemove={handleEdgeRemove}
        onDropUnit={handleDropUnit}
      />
      <InspectorPanel
        graph={graph}
        runCase={runCase}
        result={result}
        isBusy={isBusy}
        onRunCaseChange={setRunCase}
        onLoadGraphExample={handleLoadGraphExample}
        onLoadRunCaseExample={handleLoadRunCaseExample}
        onSimulate={runSimulation}
        onOptimize={runOptimization}
      />
      <ParameterDialog
        node={parameterTarget}
        isOpen={Boolean(parameterTarget)}
        onClose={() => setParameterTarget(null)}
        onSave={handleNodeParamsSave}
      />
    </div>
  );
}
