import { FC, useCallback, useMemo, useRef, useState } from "react";
import { MEDIUM_COLORS } from "../styles/colors";
import { GraphEdge, GraphNode, GraphState, PaletteUnit, PortReference } from "../types/graph";

interface GraphCanvasProps {
  graph: GraphState;
  paletteIndex: Map<string, PaletteUnit>;
  onNodePositionChange: (nodeId: string, position: { x: number; y: number }) => void;
  onNodeParamsRequest: (nodeId: string) => void;
  onEdgeCreate: (from: PortReference, to: PortReference, medium: GraphEdge["medium"]) => void;
  onNodeSelect: (nodeId: string | null) => void;
  onEdgeRemove: (edgeId: string) => void;
  onDropUnit: (unit: PaletteUnit, position: { x: number; y: number }) => void;
}

const NODE_WIDTH = 160;
const NODE_HEIGHT = 80;
const PORT_RADIUS = 6;

interface DragState {
  nodeId: string;
  offsetX: number;
  offsetY: number;
}

interface EdgeDraft {
  from: PortReference;
  medium: GraphEdge["medium"];
}

function getPortsByDirection(node: GraphNode, direction: "in" | "out") {
  return Object.entries(node.ports).filter(([, port]) => port.direction === direction);
}

function getPortPosition(node: GraphNode, portId: string, index: number, total: number, direction: "in" | "out") {
  const spacing = NODE_HEIGHT / (total + 1);
  const y = node.position.y + spacing * (index + 1);
  const x = direction === "in" ? node.position.x : node.position.x + NODE_WIDTH;
  return { x, y };
}

function buildEdgePath(source: { x: number; y: number }, target: { x: number; y: number }) {
  const dx = (target.x - source.x) * 0.5;
  return `M ${source.x} ${source.y} C ${source.x + dx} ${source.y}, ${target.x - dx} ${target.y}, ${target.x} ${target.y}`;
}

export const GraphCanvas: FC<GraphCanvasProps> = ({
  graph,
  paletteIndex,
  onNodePositionChange,
  onNodeParamsRequest,
  onEdgeCreate,
  onNodeSelect,
  onEdgeRemove,
  onDropUnit
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [edgeDraft, setEdgeDraft] = useState<EdgeDraft | null>(null);
  const [draftPointer, setDraftPointer] = useState<{ x: number; y: number } | null>(null);
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);

  const portPositions = useMemo(() => {
    const map = new Map<string, { x: number; y: number; medium: GraphEdge["medium"]; direction: "in" | "out" }>();
    graph.nodes.forEach((node) => {
      const inputs = getPortsByDirection(node, "in");
      const outputs = getPortsByDirection(node, "out");
      inputs.forEach(([portId, port], index) => {
        const pos = getPortPosition(node, portId, index, inputs.length, "in");
        map.set(`${node.id}.${portId}`, { ...pos, medium: port.medium, direction: port.direction });
      });
      outputs.forEach(([portId, port], index) => {
        const pos = getPortPosition(node, portId, index, outputs.length, "out");
        map.set(`${node.id}.${portId}`, { ...pos, medium: port.medium, direction: port.direction });
      });
    });
    return map;
  }, [graph.nodes]);

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return;
      const point = svg.createSVGPoint();
      point.x = event.clientX;
      point.y = event.clientY;
      const screenCTM = svg.getScreenCTM();
      if (!screenCTM) return;
      const cursor = point.matrixTransform(screenCTM.inverse());
      if (dragState) {
        const x = cursor.x - dragState.offsetX;
        const y = cursor.y - dragState.offsetY;
        onNodePositionChange(dragState.nodeId, { x, y });
      }
      if (edgeDraft) {
        setDraftPointer({ x: cursor.x, y: cursor.y });
      }
    },
    [dragState, edgeDraft, onNodePositionChange]
  );

  const handlePointerUp = useCallback(() => {
    setDragState(null);
    setDraftPointer(null);
  }, []);

  const handleNodePointerDown = useCallback((event: React.PointerEvent, node: GraphNode) => {
    event.stopPropagation();
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const offsetX = event.clientX - rect.left - node.position.x;
    const offsetY = event.clientY - rect.top - node.position.y;
    setDragState({ nodeId: node.id, offsetX, offsetY });
    onNodeSelect(node.id);
  }, [onNodeSelect]);

  const handleBackgroundPointerDown = useCallback(() => {
    onNodeSelect(null);
    setEdgeDraft(null);
    setDraftPointer(null);
  }, [onNodeSelect]);

  const handlePortMouseDown = useCallback((event: React.MouseEvent, nodeId: string, portId: string) => {
    event.stopPropagation();
    const portKey = `${nodeId}.${portId}`;
    const portMeta = portPositions.get(portKey);
    if (!portMeta) return;
    setEdgeDraft({
      from: { nodeId, portId },
      medium: portMeta.medium
    });
    setDraftPointer({ x: portMeta.x, y: portMeta.y });
  }, [portPositions]);

  const handlePortMouseUp = useCallback((event: React.MouseEvent, targetNodeId: string, targetPortId: string) => {
    event.stopPropagation();
    if (!edgeDraft) return;
    const targetKey = `${targetNodeId}.${targetPortId}`;
    const targetMeta = portPositions.get(targetKey);
    if (!targetMeta) return;
    if (edgeDraft.from.nodeId === targetNodeId && edgeDraft.from.portId === targetPortId) {
      setEdgeDraft(null);
      setDraftPointer(null);
      return;
    }
    const fromMeta = portPositions.get(`${edgeDraft.from.nodeId}.${edgeDraft.from.portId}`);
    if (!fromMeta) {
      setEdgeDraft(null);
      return;
    }
    if (fromMeta.direction === targetMeta.direction) {
      setEdgeDraft(null);
      return;
    }
    if (fromMeta.direction === "out") {
      onEdgeCreate(edgeDraft.from, { nodeId: targetNodeId, portId: targetPortId }, edgeDraft.medium);
    } else {
      onEdgeCreate({ nodeId: targetNodeId, portId: targetPortId }, edgeDraft.from, edgeDraft.medium);
    }
    setEdgeDraft(null);
    setDraftPointer(null);
  }, [edgeDraft, onEdgeCreate, portPositions]);

  const handleDragOver = (event: React.DragEvent) => {
    if (event.dataTransfer.types.includes("application/hbd-unit")) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    }
  };

  const handleDrop = (event: React.DragEvent) => {
    const payload = event.dataTransfer.getData("application/hbd-unit");
    if (!payload) return;
    const unit: PaletteUnit = JSON.parse(payload);
    const rect = svgRef.current?.getBoundingClientRect();
    const x = event.clientX - (rect?.left ?? 0) - NODE_WIDTH / 2;
    const y = event.clientY - (rect?.top ?? 0) - NODE_HEIGHT / 2;
    onDropUnit(unit, { x, y });
  };

  return (
    <section className="canvas-area" onPointerDown={handleBackgroundPointerDown} onDragOver={handleDragOver} onDrop={handleDrop}>
      <svg
        ref={svgRef}
        className="canvas-svg"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {graph.edges.map((edge) => {
          const from = portPositions.get(`${edge.from.nodeId}.${edge.from.portId}`);
          const to = portPositions.get(`${edge.to.nodeId}.${edge.to.portId}`);
          if (!from || !to) return null;
          const path = buildEdgePath(from, to);
          const color = MEDIUM_COLORS[edge.medium];
          return (
            <g
              key={edge.id}
              onMouseEnter={() => setHoverEdge(edge.id)}
              onMouseLeave={() => setHoverEdge((prev) => (prev === edge.id ? null : prev))}
            >
              <path className="edge-path" d={path} stroke={color} />
              {hoverEdge === edge.id ? (
                <circle
                  className="edge-handle"
                  cx={(from.x + to.x) / 2}
                  cy={(from.y + to.y) / 2}
                  r={8}
                  onClick={() => onEdgeRemove(edge.id)}
                />
              ) : null}
            </g>
          );
        })}

        {edgeDraft && draftPointer ? (() => {
          const from = portPositions.get(`${edgeDraft.from.nodeId}.${edgeDraft.from.portId}`);
          if (!from) return null;
          const path = buildEdgePath(from, draftPointer);
          const color = MEDIUM_COLORS[edgeDraft.medium];
          return <path className="edge-path" d={path} stroke={color} strokeDasharray="6 4" />;
        })() : null}

        {graph.nodes.map((node) => {
          const palette = paletteIndex.get(node.type);
          return (
            <g key={node.id} transform={`translate(${node.position.x}, ${node.position.y})`}>
              <rect
                className="node-rect"
                width={NODE_WIDTH}
                height={NODE_HEIGHT}
                rx={10}
                onPointerDown={(event) => handleNodePointerDown(event, node)}
                onDoubleClick={() => onNodeParamsRequest(node.id)}
              />
              <text className="node-label" x={NODE_WIDTH / 2} y={NODE_HEIGHT / 2} textAnchor="middle" alignmentBaseline="middle">
                {node.label}
              </text>
              <text
                x={NODE_WIDTH / 2}
                y={NODE_HEIGHT - 10}
                textAnchor="middle"
                alignmentBaseline="middle"
                style={{ fill: "#5f7999", fontSize: "10px" }}
              >
                {palette?.label ?? node.type}
              </text>
            </g>
          );
        })}

        {graph.nodes.map((node) => {
          const inputs = getPortsByDirection(node, "in");
          const outputs = getPortsByDirection(node, "out");
          return (
            <g key={`${node.id}-ports`}>
              {inputs.map(([portId, port], index) => {
                const pos = getPortPosition(node, portId, index, inputs.length, "in");
                return (
                  <g key={`${node.id}-${portId}`} transform={`translate(${pos.x}, ${pos.y})`}>
                    <circle
                      className="port-circle"
                      r={PORT_RADIUS}
                      fill={MEDIUM_COLORS[port.medium]}
                      onMouseDown={(event) => handlePortMouseDown(event, node.id, portId)}
                      onMouseUp={(event) => handlePortMouseUp(event, node.id, portId)}
                    />
                    <text x={-10} y={-10} textAnchor="end" style={{ fill: "#5f7999", fontSize: "9px" }}>
                      {portId}
                    </text>
                  </g>
                );
              })}
              {outputs.map(([portId, port], index) => {
                const pos = getPortPosition(node, portId, index, outputs.length, "out");
                return (
                  <g key={`${node.id}-${portId}`} transform={`translate(${pos.x}, ${pos.y})`}>
                    <circle
                      className="port-circle"
                      r={PORT_RADIUS}
                      fill={MEDIUM_COLORS[port.medium]}
                      onMouseDown={(event) => handlePortMouseDown(event, node.id, portId)}
                      onMouseUp={(event) => handlePortMouseUp(event, node.id, portId)}
                    />
                    <text x={10} y={-10} textAnchor="start" style={{ fill: "#5f7999", fontSize: "9px" }}>
                      {portId}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </section>
  );
};
