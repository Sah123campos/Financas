import { useCallback, useRef, useState } from 'react';

/** Estado com desfazer/refazer (snapshots imutáveis). */
export function useHistory<T>(initial: T, limit = 60) {
  const [state, setState] = useState(initial);
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const [, force] = useState(0);
  const set = useCallback((next: T | ((s: T) => T)) => {
    setState((cur) => {
      const n = typeof next === 'function' ? (next as (s: T) => T)(cur) : next;
      if (n === cur) return cur;
      past.current = [...past.current.slice(-limit + 1), cur];
      future.current = [];
      return n;
    });
    force((x) => x + 1);
  }, [limit]);
  const undo = useCallback(() => {
    setState((cur) => { const p = past.current.pop(); if (p === undefined) return cur; future.current.push(cur); return p; });
    force((x) => x + 1);
  }, []);
  const redo = useCallback(() => {
    setState((cur) => { const f = future.current.pop(); if (f === undefined) return cur; past.current.push(cur); return f; });
    force((x) => x + 1);
  }, []);
  const replace = useCallback((v: T) => { past.current = []; future.current = []; setState(v); force((x) => x + 1); }, []);
  return { state, set, undo, redo, replace, canUndo: past.current.length > 0, canRedo: future.current.length > 0 };
}
