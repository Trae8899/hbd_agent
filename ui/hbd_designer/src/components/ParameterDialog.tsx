import React, { useMemo, useState } from 'react';
import type { GraphNode, PaletteUnit } from '../state/graph';

interface ParameterDialogProps {
  node: GraphNode | null;
  palette: Map<string, PaletteUnit>;
  onClose: () => void;
  onSave: (nodeId: string, params: Record<string, unknown>) => void;
}

export const ParameterDialog: React.FC<ParameterDialogProps> = ({
  node,
  palette,
  onClose,
  onSave
}) => {
  const spec = useMemo(() => (node ? palette.get(node.type) : undefined), [node, palette]);
  const parameterKeys = useMemo(() => {
    if (!node) return [] as string[];
    const keys = new Set<string>();
    if (spec) {
      Object.keys(spec.defaults ?? {}).forEach((key) => keys.add(key));
    }
    Object.keys(node.params ?? {}).forEach((key) => keys.add(key));
    return Array.from(keys.values());
  }, [node, spec]);
  const [formState, setFormState] = useState<Record<string, string>>(() => ({}));

  React.useEffect(() => {
    if (node) {
      const newState: Record<string, string> = {};
      for (const [key, value] of Object.entries(node.params ?? {})) {
        newState[key] = value === null || value === undefined ? '' : String(value);
      }
      setFormState(newState);
    }
  }, [node]);

  if (!node) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-xl w-[480px] max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div>
            <h3 className="text-lg font-semibold text-slate-100">{node.label}</h3>
            <p className="text-xs text-slate-400">Configure parameters</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-100 transition-colors"
          >
            ✕
          </button>
        </div>
        <div className="p-5 space-y-4">
          {parameterKeys.length > 0 ? (
            parameterKeys.map((key) => {
              const defaultValue = spec?.defaults?.[key];
              return (
                <label key={key} className="block">
                  <span className="text-xs uppercase text-slate-400">{key}</span>
                  <input
                    type="text"
                    value={formState[key] ?? ''}
                    onChange={(event) => {
                      const value = event.target.value;
                      setFormState((prev) => ({ ...prev, [key]: value }));
                    }}
                    placeholder={defaultValue !== undefined ? String(defaultValue ?? '') : ''}
                    className="mt-1 w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </label>
              );
            })
          ) : (
            <p className="text-sm text-slate-400">No editable parameters detected.</p>
          )}
        </div>
        <div className="px-5 py-4 border-t border-slate-800 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              const parsed: Record<string, unknown> = {};
              for (const [key, value] of Object.entries(formState)) {
                if (value === '') {
                  parsed[key] = null;
                  continue;
                }
                const numeric = Number(value);
                parsed[key] = Number.isFinite(numeric) ? numeric : value;
              }
              onSave(node.id, parsed);
              onClose();
            }}
            className="px-4 py-2 text-sm rounded-lg bg-sky-500 text-slate-900 font-semibold hover:bg-sky-400"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};
