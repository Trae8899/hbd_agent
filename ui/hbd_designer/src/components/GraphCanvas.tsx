import React, { useCallback, useMemo, useRef, useState } from 'react';
import type { GraphEdge, GraphNode, GraphPort } from '../state/graph';
import { MEDIUM_COLORS } from '../state/graph';

type PointerPosition = { x: number; y: number };

interface GraphCanvasProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onMoveNode: (nodeId: string, delta: { x: number; y: number }) => void;
  onSelectNode: (nodeId: string | null) => void;
  onBeginConnection: (node: GraphNode, port: GraphPort) => void;
  onCommitConnection: (node: GraphNode, port: GraphPort) => void;
  onCancelConnection: () => void;
  selectedNodeId: string | null;
  pendingConnectionPort?: GraphPort | null;
  onRemoveNode: (nodeId: string) => void;
  onRemoveEdge: (edgeId: string) => void;
  onScheduleRun: () => void;
  onOpenNode: (nodeId: string) => void;
}

interface NodeDragState {
  nodeId: string;
  origin: PointerPosition;
}

const GRID_SIZE = 24;

export const GraphCanvas: React.FC<GraphCanvasProps> = ({
  nodes,
  edges,
  onMoveNode,
  onSelectNode,
  onBeginConnection,
  onCommitConnection,
  onCancelConnection,
  selectedNodeId,
  pendingConnectionPort,
  onRemoveNode,
  onRemoveEdge,
  onScheduleRun,
  onOpenNode
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragState, setDragState] = useState<NodeDragState | null>(null);
  const [hoverPort, setHoverPort] = useState<GraphPort | null>(null);
  const [pointer, setPointer] = useState<PointerPosition | null>(null);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent, nodeId: string) => {
      event.preventDefault();
      const point = getRelativePoint(event, svgRef.current);
      if (!point) return;
      setDragState({ nodeId, origin: point });
      onSelectNode(nodeId);
    },
    [onSelectNode]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent) => {
      const point = getRelativePoint(event, svgRef.current);
      if (point) {
        setPointer(point);
      }
      if (!dragState || !point) return;
      const delta = {
        x: snapToGrid(point.x - dragState.origin.x),
        y: snapToGrid(point.y - dragState.origin.y)
      };
      setDragState((prev) => (prev ? { ...prev, origin: point } : prev));
      if (delta.x !== 0 || delta.y !== 0) {
        onMoveNode(dragState.nodeId, delta);
        onScheduleRun();
      }
    },
    [dragState, onMoveNode, onScheduleRun]
  );

  const handlePointerUp = useCallback(() => {
    setDragState(null);
    onCancelConnection();
  }, [onCancelConnection]);

  const handleCanvasPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (event.target === svgRef.current) {
        onSelectNode(null);
      }
    },
    [onSelectNode]
  );

  const renderPorts = useCallback(
    (node: GraphNode) =>
      node.ports.map((port, index) => {
        const isOutput = port.direction === 'out';
        const offset = isOutput ? nodeWidth / 2 : -nodeWidth / 2;
        const y = node.position.y + 40 + index * 22;
        const x = node.position.x + offset;
        return (
          <circle
            key={port.id}
            cx={x}
            cy={y}
            r={8}
            fill={MEDIUM_COLORS[port.medium]}
            stroke={hoverPort?.id === port.id ? '#facc15' : '#0f172a'}
            strokeWidth={hoverPort?.id === port.id ? 3 : 2}
            className="cursor-crosshair"
            onPointerDown={(event) => {
              event.stopPropagation();
              onBeginConnection(node, port);
            }}
            onPointerUp={(event) => {
              event.stopPropagation();
              onCommitConnection(node, port);
              onScheduleRun();
            }}
            onPointerEnter={() => setHoverPort(port)}
            onPointerLeave={() => setHoverPort(null)}
          />
        );
      }),
    [hoverPort, onBeginConnection, onCommitConnection, onScheduleRun]
  );

  const pendingConnector = useMemo(() => {
    if (!pendingConnectionPort || !pointer) {
      return null;
    }
    const from = locatePort(
      pendingConnectionPort.id.split('.')[0],
      pendingConnectionPort.id.split('.')[1],
      nodes
    );
    if (!from) return null;
    const to = hoverPort
      ? locatePort(hoverPort.id.split('.')[0], hoverPort.id.split('.')[1], nodes)
      : {
          x: pointer.x,
          y: pointer.y,
          port: pendingConnectionPort
        };
    if (!to) return null;
    const path = buildPath(from, to);
    return <path d={path} stroke="#facc15" strokeWidth={3} fill="none" strokeDasharray="6 6" />;
  }, [pendingConnectionPort, pointer, hoverPort, nodes]);

  return (
    <div className="relative flex-1" onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}>
      <svg
        ref={svgRef}
        className="w-full h-full"
        viewBox="0 0 1920 1080"
        onPointerDown={handleCanvasPointerDown}
      >
        <GridPattern />
        <rect width="1920" height="1080" fill="url(#grid-pattern)" />
        {edges.map((edge) => (
          <EdgePath key={edge.id} edge={edge} nodes={nodes} onRemove={onRemoveEdge} />
        ))}
        {pendingConnector}
        {nodes.map((node) => (
          <g key={node.id} className="cursor-grab">
            <rect
              x={node.position.x - nodeWidth / 2}
              y={node.position.y}
              width={nodeWidth}
              height={nodeHeight(node)}
              rx={14}
              ry={14}
              fill={selectedNodeId === node.id ? '#1f2937' : '#0f172a'}
              stroke={selectedNodeId === node.id ? '#38bdf8' : '#1e293b'}
              strokeWidth={selectedNodeId === node.id ? 3 : 2}
              onPointerDown={(event) => handlePointerDown(event, node.id)}
              onDoubleClick={(event) => {
                event.stopPropagation();
                onOpenNode(node.id);
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                onRemoveNode(node.id);
              }}
            />
           <text
             x={node.position.x}
             y={node.position.y + 28}
             textAnchor="middle"
             className="fill-slate-100 text-sm font-semibold select-none"
           >
             {node.label}
           </text>
            {renderPorts(node)}
          </g>
        ))}
      </svg>
    </div>
  );
};

const nodeWidth = 180;

function nodeHeight(node: GraphNode) {
  return 80 + Math.max(node.ports.length, 1) * 22;
}

const GridPattern: React.FC = () => (
  <defs>
    <pattern id="grid-pattern" width={GRID_SIZE} height={GRID_SIZE} patternUnits="userSpaceOnUse">
      <path d={`M ${GRID_SIZE} 0 L 0 0 0 ${GRID_SIZE}`} fill="none" stroke="#1e293b" strokeWidth={1} />
    </pattern>
  </defs>
);

const EdgePath: React.FC<{
  edge: GraphEdge;
  nodes: GraphNode[];
  onRemove: (edgeId: string) => void;
}> = ({ edge, nodes, onRemove }) => {
  const from = locatePort(edge.from.nodeId, edge.from.portId, nodes);
  const to = locatePort(edge.to.nodeId, edge.to.portId, nodes);
  if (!from || !to) return null;
  const path = buildPath(from, to);
  const markerId = `arrow-${edge.id}`;
  return (
    <g
      onDoubleClick={() => onRemove(edge.id)}
      className="cursor-pointer"
      stroke={MEDIUM_COLORS[edge.medium]}
      fill="none"
      strokeWidth={4}
    >
      <path d={path} markerEnd={`url(#${markerId})`} />
      <defs>
        <marker id={markerId} markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill={MEDIUM_COLORS[edge.medium]} />
        </marker>
      </defs>
    </g>
  );
};

function locatePort(nodeId: string, portId: string, nodes: GraphNode[]) {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return null;
  const port = node.ports.find((p) => p.id === `${nodeId}.${portId}`);
  if (!port) return null;
  const index = node.ports.indexOf(port);
  const isOutput = port.direction === 'out';
  const offset = isOutput ? nodeWidth / 2 : -nodeWidth / 2;
  const x = node.position.x + offset;
  const y = node.position.y + 40 + index * 22;
  return { x, y, port };
}

function buildPath(
  from: { x: number; y: number; port: GraphPort },
  to: { x: number; y: number; port: GraphPort }
) {
  const controlOffset = Math.max(Math.abs(to.x - from.x) * 0.6, 80);
  const c1x = from.x + (from.port.direction === 'out' ? controlOffset : -controlOffset);
  const c2x = to.x + (to.port.direction === 'in' ? -controlOffset : controlOffset);
  return `M ${from.x} ${from.y} C ${c1x} ${from.y}, ${c2x} ${to.y}, ${to.x} ${to.y}`;
}

function getRelativePoint(event: React.PointerEvent, svg: SVGSVGElement | null): PointerPosition | null {
  if (!svg) return null;
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const transformed = point.matrixTransform(ctm.inverse());
  return { x: transformed.x, y: transformed.y };
}

function snapToGrid(value: number) {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}
