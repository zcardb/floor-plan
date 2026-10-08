import { useCallback, useRef, useState } from "react";
import type { Design } from "./types";
export function useDesign(initial: Design, onChange: (d: Design) => void) {
  const [design, setDesign] = useState(initial),
    [counts, setCounts] = useState({ undo: 0, redo: 0 });
  const current = useRef(design),
    past = useRef<Design[]>([]),
    future = useRef<Design[]>([]),
    notify = useRef(onChange);
  notify.current = onChange;
  const set = useCallback((d: Design) => {
    current.current = d;
    setDesign(d);
  }, []);
  const commit = useCallback(
    (d: Design, before = current.current) => {
      if (JSON.stringify(before) === JSON.stringify(d)) return;
      past.current.push(structuredClone(before));
      if (past.current.length > 150) past.current.shift();
      future.current = [];
      set(d);
      setCounts({ undo: past.current.length, redo: 0 });
      notify.current(d);
    },
    [set],
  );
  const change = useCallback(
    (fn: (d: Design) => Design) => commit(fn(structuredClone(current.current))),
    [commit],
  );
  const undo = useCallback(() => {
    const d = past.current.pop();
    if (!d) return;
    future.current.push(current.current);
    set(d);
    setCounts({ undo: past.current.length, redo: future.current.length });
    notify.current(d);
  }, [set]);
  const redo = useCallback(() => {
    const d = future.current.pop();
    if (!d) return;
    past.current.push(current.current);
    set(d);
    setCounts({ undo: past.current.length, redo: future.current.length });
    notify.current(d);
  }, [set]);
  return { design, current, change, commit, preview: set, undo, redo, counts };
}
