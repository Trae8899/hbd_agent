import React from 'react';
import type { RunCase } from '../state/graph';

interface ToolbarProps {
  runCase: RunCase;
  autoRun: boolean;
  onModeChange: (mode: RunCase['mode']) => void;
  onObjectiveChange: (objective: RunCase['objective']) => void;
  onToggleAutoRun: (autoRun: boolean) => void;
  onImportGraph: (file: File) => void;
  onExportGraph: () => void;
  onRun: () => void;
  onLoadExample: (exampleId: string) => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  runCase,
  autoRun,
  onModeChange,
  onObjectiveChange,
  onToggleAutoRun,
  onImportGraph,
  onExportGraph,
  onRun,
  onLoadExample
}) => {
  return (
    <header className="h-16 bg-slate-950 border-b border-slate-800 flex items-center px-4 gap-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-400">Mode</span>
        <select
          value={runCase.mode}
          onChange={(event) => onModeChange(event.target.value as RunCase['mode'])}
          className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm"
        >
          <option value="simulate">Simulate</option>
          <option value="optimize">Optimize</option>
        </select>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-400">Objective</span>
        <select
          value={runCase.objective}
          onChange={(event) => onObjectiveChange(event.target.value as RunCase['objective'])}
          className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm"
        >
          <option value="max_power">Max Power</option>
          <option value="min_heat_rate">Min Heat Rate</option>
          <option value="max_efficiency">Max Efficiency</option>
          <option value="max_revenue">Max Revenue</option>
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-400">
        <input
          type="checkbox"
          checked={autoRun}
          onChange={(event) => onToggleAutoRun(event.target.checked)}
        />
        Auto-run (0.5 s)
      </label>
      <div className="flex items-center gap-2">
        <input
          type="file"
          accept="application/json"
          id="graph-import"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              onImportGraph(file);
              event.target.value = '';
            }
          }}
        />
        <label
          htmlFor="graph-import"
          className="px-3 py-1.5 text-sm rounded-lg bg-slate-800 hover:bg-slate-700 cursor-pointer"
        >
          Import Graph
        </label>
        <button
          onClick={onExportGraph}
          className="px-3 py-1.5 text-sm rounded-lg bg-slate-800 hover:bg-slate-700"
        >
          Export Graph
        </button>
      </div>
      <div className="flex items-center gap-2">
        <select
          onChange={(event) => {
            if (event.target.value) {
              onLoadExample(event.target.value);
              event.target.value = '';
            }
          }}
          defaultValue=""
          className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm"
        >
          <option value="" disabled>
            Load example graph...
          </option>
          <option value="ccpp_simple">CCPP - Simple</option>
          <option value="ccpp_reheat">CCPP - Reheat</option>
          <option value="chp_dhn">CHP - DHN</option>
        </select>
      </div>
      <button
        onClick={onRun}
        className="ml-auto px-4 py-2 text-sm rounded-lg bg-sky-500 text-slate-900 font-semibold hover:bg-sky-400"
      >
        Run Now
      </button>
    </header>
  );
};
