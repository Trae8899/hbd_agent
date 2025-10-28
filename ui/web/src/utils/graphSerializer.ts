import { GraphEdge, GraphNode, GraphState, PlantGraph, PlantGraphUnit, RunCase } from "../types/graph";

function buildPortId(nodeId: string, portId: string): string {
  return `${nodeId}.${portId}`;
}

export function graphToPlant(graph: GraphState): PlantGraph {
  const units: PlantGraphUnit[] = graph.nodes.map((node) => ({
    id: node.id,
    type: node.type,
    params: node.params
  }));

  const streams = graph.edges.map((edge) => ({
    from: buildPortId(edge.from.nodeId, edge.from.portId),
    to: buildPortId(edge.to.nodeId, edge.to.portId)
  }));

  return {
    meta: { version: "1.0" },
    ambient: graph.ambient,
    units,
    streams
  };
}

export function plantToGraph(plant: PlantGraph, paletteIndex: Map<string, GraphNode["ports"]>): GraphState {
  const nodes: GraphNode[] = plant.units.map((unit, idx) => {
    const ports = paletteIndex.get(unit.type) ?? {};
    return {
      id: unit.id,
      type: unit.type,
      label: unit.id,
      params: unit.params ?? {},
      ports,
      position: {
        x: 120 + (idx % 4) * 220,
        y: 120 + Math.floor(idx / 4) * 180
      }
    };
  });

  const edges: GraphEdge[] = plant.streams
    .map((stream, index) => {
      const [fromNode, fromPort] = stream.from.split(".");
      const [toNode, toPort] = stream.to.split(".");
      const fromNodeDefinition = nodes.find((node) => node.id === fromNode);
      const medium = fromNodeDefinition?.ports?.[fromPort]?.medium ?? "water";
      return {
        id: `edge-${index}`,
        from: { nodeId: fromNode, portId: fromPort },
        to: { nodeId: toNode, portId: toPort },
        medium
      };
    })
    .filter((edge) => Boolean(edge.from && edge.to));

  return {
    nodes,
    edges,
    ambient: plant.ambient
  };
}

export function buildRunPayload(graph: GraphState, runCase: RunCase) {
  return {
    plant_graph: graphToPlant(graph),
    run_case: runCase
  };
}
