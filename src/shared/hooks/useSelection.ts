import { useCallback, useMemo, useState } from "react";

/** Multi-selection keyed by string ids. */
export function useSelection() {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const setAll = useCallback((ids: string[], on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const replace = useCallback((ids: string[]) => setSelected(new Set(ids)), []);
  const clear = useCallback(() => setSelected(new Set()), []);
  const ids = useMemo(() => [...selected], [selected]);

  return {
    selected,
    ids,
    count: selected.size,
    toggle,
    setAll,
    replace,
    clear,
    has: (id: string) => selected.has(id),
  };
}
