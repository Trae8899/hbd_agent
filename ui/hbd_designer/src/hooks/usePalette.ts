import { useEffect, useState } from 'react';
import type { PaletteUnit } from '../state/graph';

export function usePalette() {
  const [palette, setPalette] = useState<PaletteUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadPalette() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('/palette/units');
        if (!response.ok) {
          throw new Error(`Failed to load palette: ${response.status}`);
        }
        const data = await response.json();
        if (!cancelled) {
          setPalette(data.units ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadPalette();

    return () => {
      cancelled = true;
    };
  }, []);

  return { palette, loading, error } as const;
}
