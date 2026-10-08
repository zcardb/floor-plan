import { useCallback, useRef, useState } from "react";
import { createSizeTransaction, type SizeTransaction } from './sizeTransaction';
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
  const transaction = useRef<SizeTransaction | null>(null);
  const commit = useCallback(
    (d: Design, before = current.current) => {
      transaction.current?.cancel();
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
    (fn: (d: Design) => Design) => { transaction.current?.cancel(); commit(fn(structuredClone(current.current))); },
    [commit],
  );
  const undo = useCallback(() => {
    transaction.current?.cancel();
    const d = past.current.pop();
    if (!d) return;
    future.current.push(current.current);
    set(d);
    setCounts({ undo: past.current.length, redo: future.current.length });
    notify.current(d);
  }, [set]);
  const redo = useCallback(() => {
    transaction.current?.cancel();
    const d = future.current.pop();
    if (!d) return;
    past.current.push(current.current);
    set(d);
    setCounts({ undo: past.current.length, redo: future.current.length });
    notify.current(d);
  }, [set]);
  if(!transaction.current)transaction.current=createSizeTransaction(()=>current.current,set,commit);
  return { design, current, change, commit, preview: set, undo, redo, counts, sizeTransaction: transaction.current };
}
