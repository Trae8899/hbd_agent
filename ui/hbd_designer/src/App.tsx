import React, { useEffect, useMemo, useState } from 'react';
import { GraphCanvas } from './components/GraphCanvas';
import { PaletteSidebar } from './components/PaletteSidebar';
import { ParameterDialog } from './components/ParameterDialog';
import { RunSummary } from './components/RunSummary';
import { Toolbar } from './components/Toolbar';
import { usePalette } from './hooks/usePalette';
import { useDesignerState } from './hooks/useDesignerState';
import type { PaletteUnit, PlantGraph, RunCase } from './state/graph';

const exampleGraphEndpoint = (id: string) => `/examples/graphs/${id}`;
const exampleRunCaseEndpoint = (id: string) => `/examples/run_case/${id}`;

const App: React.FC = () => {
  const { palette, loading: paletteLoading, error: paletteError } = usePalette();
  const [lastDraggedUnit, setLastDraggedUnit] = useState<PaletteUnit | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const {
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
  } = useDesignerState({ palette });

  useEffect(() => {
    if (state.nodes.length > 0) {
      scheduleRun('graph');
    }
  }, [state.nodes.length, scheduleRun]);

  useEffect(() => {
    if (paletteError) {
      console.error(paletteError);
    }
  }, [paletteError]);

  const selectedNode = useMemo(
    () => state.nodes.find((node) => node.id === state.selectedNodeId) ?? null,
    [state.nodes, state.selectedNodeId]
  );

  useEffect(() => {
    if (!selectedNode) {
      setIsDialogOpen(false);
    }
  }, [selectedNode]);

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const data = event.dataTransfer.getData('application/json');
    const unit: PaletteUnit | null = data ? JSON.parse(data) : lastDraggedUnit;
    if (!unit) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const position = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
    addNode(unit, position);
    scheduleRun('graph');
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const handleImportGraph = async (file: File) => {
    const text = await file.text();
    const data = JSON.parse(text) as PlantGraph;
    importGraph(data);
    scheduleRun('graph');
  };

  const handleExportGraph = () => {
    const serialized = exportGraph();
    const blob = new Blob([JSON.stringify(serialized, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'plant_graph.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleLoadExample = async (exampleId: string) => {
    try {
      const [graphResponse, runCaseResponse] = await Promise.all([
        fetch(exampleGraphEndpoint(`${exampleId}.json`)),
        fetch(exampleRunCaseEndpoint(`${exampleId}.json`))
      ]);
      if (!graphResponse.ok) {
        throw new Error(`Failed to load graph example ${exampleId}`);
      }
      const graph = (await graphResponse.json()) as PlantGraph;
      importGraph(graph);
      if (runCaseResponse.ok) {
        const runCase = (await runCaseResponse.json()) as RunCase;
        loadRunCase(runCase);
      }
      scheduleRun('graph');
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100">
      <Toolbar
        runCase={state.runCase}
        autoRun={state.autoRun}
        onModeChange={(mode) => {
          loadRunCase({ ...state.runCase, mode });
          scheduleRun('graph');
        }}
        onObjectiveChange={(objective) => {
          loadRunCase({ ...state.runCase, objective });
          scheduleRun('graph');
        }}
        onToggleAutoRun={(autoRun) => setAutoRun(autoRun)}
        onImportGraph={handleImportGraph}
        onExportGraph={handleExportGraph}
        onRun={() => runSimulation()}
        onLoadExample={handleLoadExample}
      />
      <div className="flex flex-1 overflow-hidden">
        <PaletteSidebar palette={palette} onStartDrag={(unit) => setLastDraggedUnit(unit)} />
        <div className="flex-1 relative" onDrop={handleDrop} onDragOver={handleDragOver}>
          <GraphCanvas
            nodes={state.nodes}
            edges={state.edges}
            onMoveNode={moveNode}
            onSelectNode={(id) => {
              selectNode(id);
            }}
            onBeginConnection={beginConnection}
            onCommitConnection={commitConnection}
            onCancelConnection={cancelConnection}
            selectedNodeId={state.selectedNodeId}
            pendingConnectionPort={pendingConnection?.port}
            onRemoveNode={(nodeId) => {
              removeNode(nodeId);
              scheduleRun('graph');
            }}
            onRemoveEdge={(edgeId) => {
              removeEdge(edgeId);
              scheduleRun('graph');
            }}
            onScheduleRun={() => scheduleRun('graph')}
            onOpenNode={(nodeId) => {
              selectNode(nodeId);
              setIsDialogOpen(true);
            }}
          />
        </div>
      </div>
      <RunSummary result={state.lastRunResult} isLoading={state.isLoading || paletteLoading} error={state.error ?? paletteError ?? undefined} />
      {isDialogOpen && selectedNode ? (
        <ParameterDialog
          node={selectedNode}
          palette={paletteMap}
          onClose={() => setIsDialogOpen(false)}
          onSave={(nodeId, params) => {
            updateNodeParams(nodeId, params);
            scheduleRun('graph');
          }}
        />
      ) : null}
    </div>
  );
};

export default App;
