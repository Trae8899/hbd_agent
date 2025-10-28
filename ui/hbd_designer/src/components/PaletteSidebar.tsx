import React, { useMemo } from 'react';
import type { PaletteUnit } from '../state/graph';

interface PaletteSidebarProps {
  palette: PaletteUnit[];
  onStartDrag: (unit: PaletteUnit) => void;
}

export const PaletteSidebar: React.FC<PaletteSidebarProps> = ({ palette, onStartDrag }) => {
  const grouped = useMemo(() => {
    const map = new Map<string, PaletteUnit[]>();
    for (const unit of palette) {
      const group = map.get(unit.category) ?? [];
      group.push(unit);
      map.set(unit.category, group);
    }
    return map;
  }, [palette]);

  return (
    <aside className="w-72 bg-slate-900 border-r border-slate-800 overflow-y-auto">
      <div className="p-4">
        <h2 className="text-lg font-semibold mb-4">Palette</h2>
        {palette.length === 0 ? (
          <p className="text-sm text-slate-400">Loading palette...</p>
        ) : null}
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([category, units]) => (
            <section key={category}>
              <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-2">
                {category}
              </h3>
              <ul className="space-y-2">
                {units.map((unit) => (
                  <li
                    key={unit.type}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData('application/json', JSON.stringify(unit));
                      onStartDrag(unit);
                    }}
                    className="p-3 rounded-lg border border-slate-800 hover:border-slate-500 cursor-grab bg-slate-950"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 flex items-center justify-center bg-slate-800 rounded relative overflow-hidden">
                        <img
                          src={`/ui/icons/${unit.icon}`}
                          alt=""
                          className="w-8 h-8 object-contain"
                          onError={(event) => {
                            const img = event.currentTarget as HTMLImageElement;
                            img.style.display = 'none';
                            const container = img.parentElement;
                            if (container && container.querySelector('span') === null) {
                              const fallback = document.createElement('span');
                              fallback.textContent = unit.label
                                .split(' ')
                                .map((word) => word[0])
                                .join('')
                                .slice(0, 2)
                                .toUpperCase();
                              fallback.className = 'absolute inset-0 flex items-center justify-center text-xs font-semibold text-slate-200';
                              container.appendChild(fallback);
                            }
                          }}
                        />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-200">{unit.label}</p>
                        <p className="text-xs text-slate-400 truncate">{unit.type}</p>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {Object.entries(unit.ports).map(([portKey, portSpec]) => (
                        <span
                          key={portKey}
                          className="px-2 py-0.5 text-[11px] rounded-full bg-slate-800 text-slate-300"
                        >
                          {portSpec.direction === 'in' ? '⬅' : '➡'} {portKey} ({portSpec.medium})
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </aside>
  );
};
