import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { produce } from 'immer';
import type {
  DesignerState,
  GraphEdge,
  GraphNode,
  GraphPort,
  Medium,
  PaletteUnit,
  PlantGraph,
  RunCase
} from '../state/graph';
import {
  DEFAULT_STATE,
  applyGraphImport,
  serializeGraph
} from '../state/graph';

interface UseDesignerStateOptions {
  palette: PaletteUnit[];
}

type UpdateFn = (draft: DesignerState) => void;

type PendingConnection = {
  port: GraphPort;
  node: GraphNode;
};

export function useDesignerState({ palette }: UseDesignerStateOptions) {
  const [state, setState] = useState<DesignerState>(() => DEFAULT_STATE);
  const [pendingConnection, setPendingConnection] = useState<PendingConnection | null>(null);
  const autoRunTimer = useRef<number | null>(null);

  useEffect(() => {
    setState((prev) => ({
      ...prev,
      palette
    }));
  }, [palette]);

  const updateState = useCallback(
    (fn: UpdateFn) => {
      setState((prev) => produce(prev, fn));
    },
    [setState]
  );

  const addNode = useCallback(
    (unit: PaletteUnit, position: { x: number; y: number }) => {
      updateState((draft) => {
        const id = createUniqueNodeId(draft.nodes, unit.type);
        const ports: GraphPort[] = Object.entries(unit.ports).map(([key, port]) => ({
          id: `${id}.${key}`,
          key,
          medium: port.medium,
          direction: port.direction
        }));
        const node: GraphNode = {
          id,
          type: unit.type,
          label: unit.label,
          position,
          params: { ...unit.defaults },
          ports
        };
        draft.nodes.push(node);
        draft.selectedNodeId = id;
      });
    },
    [updateState]
  );

  const moveNode = useCallback(
    (nodeId: string, delta: { x: number; y: number }) => {
      updateState((draft) => {
        const node = draft.nodes.find((n) => n.id === nodeId);
        if (node) {
          node.position.x += delta.x;
          node.position.y += delta.y;
        }
      });
    },
    [updateState]
  );

  const selectNode = useCallback(
    (nodeId: string | null) => {
      updateState((draft) => {
        draft.selectedNodeId = nodeId;
      });
    },
    [updateState]
  );

  const updateNodeParams = useCallback(
    (nodeId: string, params: Record<string, unknown>) => {
      updateState((draft) => {
        const node = draft.nodes.find((n) => n.id === nodeId);
        if (node) {
          node.params = params;
        }
      });
    },
    [updateState]
  );

  const removeEdge = useCallback(
    (edgeId: string) => {
      updateState((draft) => {
        draft.edges = draft.edges.filter((edge) => edge.id !== edgeId);
      });
    },
    [updateState]
  );

  const removeNode = useCallback(
    (nodeId: string) => {
      updateState((draft) => {
        draft.nodes = draft.nodes.filter((node) => node.id !== nodeId);
        draft.edges = draft.edges.filter(
          (edge) => edge.from.nodeId !== nodeId && edge.to.nodeId !== nodeId
        );
        if (draft.selectedNodeId === nodeId) {
          draft.selectedNodeId = null;
        }
      });
    },
    [updateState]
  );

  const beginConnection = useCallback((node: GraphNode, port: GraphPort) => {
    setPendingConnection({ node, port });
  }, []);

  const cancelConnection = useCallback(() => {
    setPendingConnection(null);
  }, []);

  const commitConnection = useCallback(
    (targetNode: GraphNode, targetPort: GraphPort) => {
      setPendingConnection((current) => {
        if (!current) return null;
        const { node, port } = current;
        if (port.direction === targetPort.direction) {
          return null;
        }
        const from = port.direction === 'out' ? port : targetPort;
        const to = port.direction === 'out' ? targetPort : port;
        if (from.medium !== to.medium) {
          return null;
        }
        updateState((draft) => {
          const exists = draft.edges.some(
            (edge) =>
              edge.from.nodeId === from.id.split('.')[0] &&
              edge.from.portId === from.id.split('.')[1] &&
              edge.to.nodeId === to.id.split('.')[0] &&
              edge.to.portId === to.id.split('.')[1]
          );
          if (exists) {
            return;
          }
          const id = `edge-${draft.edges.length + 1}`;
          const medium = (from.medium ?? targetPort.medium) as Medium;
          const edge: GraphEdge = {
            id,
            from: {
              nodeId: from.id.split('.')[0],
              portId: from.id.split('.')[1]
            },
            to: {
              nodeId: to.id.split('.')[0],
              portId: to.id.split('.')[1]
            },
            medium
          };
          draft.edges.push(edge);
        });
        return null;
      });
    },
    [updateState]
  );

  const importGraph = useCallback(
    (graph: PlantGraph) => {
      setState((prev) => applyGraphImport(prev, graph, palette));
    },
    [palette]
  );

  const loadRunCase = useCallback((runCase: RunCase) => {
    updateState((draft) => {
      draft.runCase = runCase;
    });
  }, [updateState]);

  const setAutoRun = useCallback(
    (autoRun: boolean) => {
      updateState((draft) => {
        draft.autoRun = autoRun;
      });
    },
    [updateState]
  );

  const setError = useCallback(
    (error: string | undefined) => {
      updateState((draft) => {
        draft.error = error;
      });
    },
    [updateState]
  );

  const setLoading = useCallback(
    (isLoading: boolean) => {
      updateState((draft) => {
        draft.isLoading = isLoading;
      });
    },
    [updateState]
  );

  const setRunResult = useCallback(
    (result: unknown) => {
      updateState((draft) => {
        draft.lastRunResult = result;
      });
    },
    [updateState]
  );

  const scheduleRun = useCallback(
    (trigger: 'graph' | 'manual' = 'graph') => {
      if (!state.autoRun && trigger === 'graph') {
        return;
      }
      if (autoRunTimer.current) {
        window.clearTimeout(autoRunTimer.current);
      }
      autoRunTimer.current = window.setTimeout(() => {
        runSimulation();
      }, 500);
    },
    [state.autoRun, runSimulation]
  );

  const runSimulation = useCallback(async () => {
    const payload = {
      graph: serializeGraph(state),
      run_case: state.runCase
    };
    try {
      setLoading(true);
      setError(undefined);
      const endpoint = state.runCase.mode === 'optimize' ? '/optimize' : '/simulate';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        throw new Error(`Run failed: ${response.status}`);
      }
      const data = await response.json();
      setRunResult(data);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [setLoading, setError, setRunResult, state]);

  const exportGraph = useCallback(() => serializeGraph(state), [state]);

  const paletteMap = useMemo(() => new Map(palette.map((unit) => [unit.type, unit])), [palette]);

  return {
    state,
    paletteMap,
    addNode,
    moveNode,
    selectNode,
    updateNodeParams,
    removeNode,
    removeEdge,
    beginConnection,
    cancelConnection,
    commitConnection,
    pendingConnection,
    importGraph,
    loadRunCase,
    setAutoRun,
    scheduleRun,
    runSimulation,
    exportGraph
  } as const;
}

function createUniqueNodeId(nodes: GraphNode[], type: string) {
  let index = 1;
  let id = `${type}_${index}`;
  while (nodes.some((node) => node.id === id)) {
    index += 1;
    id = `${type}_${index}`;
  }
  return id;
}
