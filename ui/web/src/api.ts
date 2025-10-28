import { PlantGraph, RunCase, SimulationResult, UnitPaletteResponse } from "./types/graph";

const JSON_HEADERS = {
  "Content-Type": "application/json"
};

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export async function fetchPalette(): Promise<UnitPaletteResponse> {
  return getJson<UnitPaletteResponse>("/palette/units");
}

export async function fetchGraphExample(name: string): Promise<PlantGraph> {
  return getJson<PlantGraph>(`/examples/graphs/${name}`);
}

export async function fetchRunCaseExample(name: string): Promise<RunCase> {
  return getJson<RunCase>(`/examples/run_case/${name}`);
}

export async function simulatePlant(payload: { plant_graph: PlantGraph; run_case: RunCase }): Promise<SimulationResult> {
  const response = await fetch("/simulate", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Simulation failed: ${response.status}`);
  }
  return response.json() as Promise<SimulationResult>;
}

export async function optimizePlant(payload: { plant_graph: PlantGraph; run_case: RunCase }): Promise<SimulationResult> {
  const response = await fetch("/optimize", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Optimization failed: ${response.status}`);
  }
  return response.json() as Promise<SimulationResult>;
}
