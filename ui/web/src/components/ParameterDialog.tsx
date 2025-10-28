import { FC, useEffect, useState } from "react";
import { GraphNode } from "../types/graph";

interface ParameterDialogProps {
  node: GraphNode | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (nodeId: string, params: Record<string, unknown>) => void;
}

export const ParameterDialog: FC<ParameterDialogProps> = ({ node, isOpen, onClose, onSave }) => {
  const [localParams, setLocalParams] = useState<Record<string, string>>({});

  useEffect(() => {
    if (node) {
      const entries = Object.entries(node.params ?? {}).reduce<Record<string, string>>((acc, [key, value]) => {
        acc[key] = value !== null && value !== undefined ? String(value) : "";
        return acc;
      }, {});
      setLocalParams(entries);
    }
  }, [node]);

  if (!isOpen || !node) {
    return null;
  }

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal>
      <div className="dialog-panel">
        <div className="dialog-header">{node.label} parameters</div>
        <form
          className="dialog-form"
          onSubmit={(event) => {
            event.preventDefault();
            const normalized = Object.entries(localParams).reduce<Record<string, unknown>>((acc, [key, value]) => {
              if (value.trim() === "") {
                acc[key] = null;
              } else if (!Number.isNaN(Number(value))) {
                acc[key] = Number(value);
              } else {
                acc[key] = value;
              }
              return acc;
            }, {});
            onSave(node.id, normalized);
            onClose();
          }}
        >
          {Object.entries(localParams).map(([key, value]) => (
            <label key={key} htmlFor={`param-${key}`}>
              {key}
              <input
                id={`param-${key}`}
                value={value}
                onChange={(event) => {
                  const next = event.target.value;
                  setLocalParams((prev) => ({ ...prev, [key]: next }));
                }}
              />
            </label>
          ))}
          <div className="dialog-actions">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit">Save</button>
          </div>
        </form>
      </div>
    </div>
  );
};
