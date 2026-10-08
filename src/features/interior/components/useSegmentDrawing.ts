import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { resolveWallPoint, resolveWallHover, type WallSnap } from '../model/wallDrawing';
import type { Design, Point } from '../model/types';

export function useSegmentDrawing(enabled: boolean, design: React.RefObject<Design>, scale: number, snap: boolean,
  submit: (design: Design, a: Point, b: Point) => void, done: () => void) {
  const [draft, setDraft] = useState<{ a: Point; b: Point; target?: WallSnap['target'] } | null>(null);
  const [candidate, setCandidate] = useState<WallSnap | null>(null);
  const [hover, setHover] = useState<WallSnap | null>(null);
  const chain = useRef<{ start: Point; first: Point } | null>(null);
  const pointer = useRef<{ id: number; screen: Point; continuing: boolean } | null>(null);
  const latest = useRef({ scale, snap, submit, done });
  latest.current = { scale, snap, submit, done };
  const clear = useCallback(() => {
    chain.current = null; pointer.current = null;
    setDraft(null); setCandidate(null); setHover(null);
  }, []);
  useEffect(() => { if (!enabled) clear(); }, [enabled, clear]);
  useEffect(() => {
    if (!enabled) return;
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,select,[role="dialog"]')) return;
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault(); clear(); latest.current.done();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [enabled, clear]);
  const move = (p: Point) => {
    setHover(resolveWallHover(p, design.current, latest.current.scale));
    const result = resolveWallPoint(p, design.current, latest.current.scale, latest.current.snap, chain.current?.start);
    setCandidate(result);
    if (chain.current) setDraft({ a: chain.current.start, b: result.point, target: result.target });
    return result;
  };
  const confirm = (p: Point) => {
    const c = chain.current;
    if (!c) return;
    const result = move(p);
    try {
      latest.current.submit(design.current, c.start, result.point);
      if (Math.hypot(result.point[0] - c.first[0], result.point[1] - c.first[1]) < 0.1) {
        clear(); latest.current.done();
      } else {
        chain.current = { start: result.point, first: c.first };
        setDraft({ a: result.point, b: result.point });
      }
    } catch (e) { toast.error(e instanceof Error ? e.message : '线段无效'); }
  };
  return { draft, candidate, hover, clear, move,
    clearHover: () => { setCandidate(null); setHover(null); },
    down(p: Point, id: number, screen: Point) {
      const continuing = !!chain.current;
      if (!continuing) {
        const { point } = move(p);
        chain.current = { start: point, first: point };
        setDraft({ a: point, b: point });
      }
      pointer.current = { id, screen, continuing };
    },
    up(p: Point, id: number, screen: Point) {
      const down = pointer.current; pointer.current = null;
      if (!down || down.id !== id) return;
      if (down.continuing || Math.hypot(screen[0] - down.screen[0], screen[1] - down.screen[1]) > 5) confirm(p);
    },
  };
}
