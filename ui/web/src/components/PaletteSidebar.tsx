import { FC } from "react";
import { PaletteUnit } from "../types/graph";

interface PaletteSidebarProps {
  palette: PaletteUnit[];
}

export const PaletteSidebar: FC<PaletteSidebarProps> = ({ palette }) => {
  return (
    <aside className="sidebar">
      <header style={{ padding: "1rem", borderBottom: "1px solid #d7dfeb" }}>
        <div style={{ fontSize: "0.75rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "#4c6480" }}>
          Unit Palette
        </div>
        <div style={{ fontWeight: 600, fontSize: "1rem", marginTop: "0.35rem" }}>Drag &amp; drop onto canvas</div>
      </header>
      <div className="palette-list">
        {palette.map((unit) => (
          <div
            key={unit.type}
            className="palette-item"
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData("application/hbd-unit", JSON.stringify(unit));
              event.dataTransfer.effectAllowed = "copy";
            }}
          >
            <div className="icon">{unit.label.slice(0, 2).toUpperCase()}</div>
            <div>
              <div style={{ fontWeight: 600 }}>{unit.label}</div>
              <div style={{ fontSize: "0.75rem", color: "#5f7999" }}>{unit.category ?? unit.type}</div>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
};
