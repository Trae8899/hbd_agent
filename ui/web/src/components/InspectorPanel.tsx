import { FC } from "react";
import { GraphState, RunCase, SimulationResult } from "../types/graph";
import { graphToPlant } from "../utils/graphSerializer";

interface InspectorPanelProps {
  graph: GraphState;
  runCase: RunCase;
  result: SimulationResult | null;
  isBusy: boolean;
  onRunCaseChange: (next: RunCase) => void;
  onLoadGraphExample: (name: string) => void;
  onLoadRunCaseExample: (name: string) => void;
  onSimulate: () => void;
  onOptimize: () => void;
}

const GRAPH_EXAMPLES = ["ccpp_base.json", "ccpp_reheat.json"];
const RUN_CASE_EXAMPLES = ["simulate.json", "optimize.json"];

export const InspectorPanel: FC<InspectorPanelProps> = ({
  graph,
  runCase,
  result,
  isBusy,
  onRunCaseChange,
  onLoadGraphExample,
  onLoadRunCaseExample,
  onSimulate,
  onOptimize
}) => {
  const serializedGraph = JSON.stringify(graphToPlant(graph), null, 2);
  return (
    <aside className="inspector">
      <section style={{ marginBottom: "1.5rem" }}>
        <header style={{ fontWeight: 600, marginBottom: "0.75rem" }}>Run configuration</header>
        <div className="toolbar" style={{ marginBottom: "0.75rem" }}>
          <label style={{ display: "flex", flexDirection: "column", fontSize: "0.8rem" }}>
            Mode
            <select
              value={runCase.mode}
              onChange={(event) => onRunCaseChange({ ...runCase, mode: event.target.value as RunCase["mode"] })}
            >
              <option value="simulate">Simulate</option>
              <option value="optimize">Optimize</option>
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", fontSize: "0.8rem" }}>
            Objective
            <select
              value={runCase.objective}
              onChange={(event) => onRunCaseChange({ ...runCase, objective: event.target.value })}
            >
              <option value="max_power">Max Power</option>
              <option value="min_heat_rate">Min Heat Rate</option>
              <option value="max_efficiency">Max Efficiency</option>
              <option value="max_revenue">Max Revenue</option>
            </select>
          </label>
        </div>
        <div className="toolbar">
          <button onClick={onSimulate} disabled={isBusy}>
            {isBusy ? "Running..." : "Simulate"}
          </button>
          <button onClick={onOptimize} disabled={isBusy || runCase.mode !== "optimize"}>
            {isBusy ? "Running..." : "Optimize"}
          </button>
        </div>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <header style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Examples</header>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <label style={{ fontSize: "0.8rem" }}>
            Load graph
            <select defaultValue="" onChange={(event) => event.target.value && onLoadGraphExample(event.target.value)}>
              <option value="" disabled>
                Select example...
              </option>
              {GRAPH_EXAMPLES.map((name) => (
                <option value={name} key={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: "0.8rem" }}>
            Load run case
            <select defaultValue="" onChange={(event) => event.target.value && onLoadRunCaseExample(event.target.value)}>
              <option value="" disabled>
                Select example...
              </option>
              {RUN_CASE_EXAMPLES.map((name) => (
                <option value={name} key={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <header style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Graph JSON</header>
        <textarea className="json-view" readOnly value={serializedGraph} />
      </section>

      <section className="status-panel">
        <header style={{ fontWeight: 600 }}>Latest result</header>
        {result ? (
          <>
            {result.summary ? (
              Object.entries(result.summary).map(([key, value]) => (
                <div className="status-row" key={key}>
                  <span>{key}</span>
                  <span className="value">{String(value)}</span>
                </div>
              ))
            ) : (
              <div style={{ fontSize: "0.85rem", color: "#5f7999" }}>Summary not available</div>
            )}
            {result.violations && result.violations.length > 0 ? (
              <div style={{ marginTop: "0.75rem" }}>
                <div style={{ fontWeight: 600, marginBottom: "0.35rem" }}>Violations</div>
                <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
                  {result.violations.map((item) => (
                    <li key={item} style={{ fontSize: "0.85rem" }}>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {result.district_heating ? (
              <div style={{ marginTop: "0.75rem" }}>
                <div style={{ fontWeight: 600, marginBottom: "0.35rem" }}>District heating</div>
                {Object.entries(result.district_heating).map(([key, value]) => (
                  <div className="status-row" key={key}>
                    <span>{key}</span>
                    <span className="value">{String(value)}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <div style={{ fontSize: "0.85rem", color: "#5f7999" }}>Trigger a run to see results.</div>
        )}
      </section>
    </aside>
  );
};
