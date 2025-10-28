import React from 'react';

interface RunSummaryProps {
  result: any;
  isLoading: boolean;
  error?: string;
}

export const RunSummary: React.FC<RunSummaryProps> = ({ result, isLoading, error }) => {
  if (isLoading) {
    return (
      <div className="px-4 py-3 text-sm text-slate-400 border-t border-slate-800">
        Running simulation...
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-3 text-sm text-red-400 border-t border-red-800 bg-red-950/40">
        {error}
      </div>
    );
  }

  if (!result) {
    return (
      <div className="px-4 py-3 text-sm text-slate-400 border-t border-slate-800">
        No results yet. Modify the graph or press <strong>Run Now</strong>.
      </div>
    );
  }

  const summary = result.summary ?? {};
  const dhn = result.district_heating ?? {};

  return (
    <div className="border-t border-slate-800 bg-slate-950">
      <div className="px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wide">KPI Summary</h3>
        <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          {Object.entries(summary).map(([key, value]) => (
            <div key={key} className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2">
              <p className="text-xs uppercase text-slate-400">{key}</p>
              <p className="text-base text-slate-100 font-semibold">
                {typeof value === 'number' ? value.toFixed(2) : String(value)}
              </p>
            </div>
          ))}
          {Object.entries(dhn).map(([key, value]) => (
            <div key={key} className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2">
              <p className="text-xs uppercase text-orange-400">{key}</p>
              <p className="text-base text-slate-100 font-semibold">
                {typeof value === 'number' ? value.toFixed(2) : String(value)}
              </p>
            </div>
          ))}
        </div>
      </div>
      {Array.isArray(result.violations) && result.violations.length > 0 ? (
        <div className="px-4 py-3 border-t border-slate-800 bg-amber-950/30">
          <h4 className="text-sm font-semibold text-amber-300">Constraint Violations</h4>
          <ul className="mt-2 list-disc list-inside text-sm text-amber-200 space-y-1">
            {result.violations.map((item: string) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
};
