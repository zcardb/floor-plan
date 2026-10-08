import { aabb, snapToStep, wallSnapCandidates, type SnapCandidate } from './geometry';
import type { Design, Furniture, Point } from './types';

/** A dashed alignment line: `axis: 'x'` is vertical at x=`at`, spanning y from `from` to `to`. */
export interface AlignmentGuide { axis: 'x' | 'y'; at: number; from: number; to: number }
interface Box { c: [number, number]; h: [number, number] }

const EPS = 1;
const anchors = (c: number, h: number) => [c - h, c, c + h];
const clean = (v: number) => Math.round(v * 1e6) / 1e6; // strip cos/sin float noise (e.g. rot 90°)
const boxOf = (f: Furniture): Box => { const { hw, hh } = aabb(f); return { c: [f.cx, f.cy], h: [clean(hw), clean(hh)] }; };

function furnitureCandidate(self: Box, others: Box[], i: 0 | 1, pos: number, tol: number) {
  let best: SnapCandidate | undefined;
  for (const o of others)
    for (const target of anchors(o.c[i], o.h[i]))
      for (const k of [-1, 0, 1]) {
        const v = target - k * self.h[i], dist = Math.abs(v - pos);
        if (dist < (best?.dist ?? tol)) best = { v, dist };
      }
  return best;
}

function guidesFor(self: Box, others: Box[], i: 0 | 1): AlignmentGuide[] {
  const j = i === 0 ? 1 : 0;
  return anchors(self.c[i], self.h[i]).flatMap(at => {
    const hits = others.filter(o => anchors(o.c[i], o.h[i]).some(a => Math.abs(a - at) <= EPS));
    if (!hits.length) return [];
    const all = [self, ...hits];
    return [{ axis: i === 0 ? 'x' : 'y', at, from: Math.min(...all.map(b => b.c[j] - b.h[j])), to: Math.max(...all.map(b => b.c[j] + b.h[j])) } as AlignmentGuide];
  });
}

/** Move furniture `f` toward raw centre `p`, snapping to walls and to other furniture edges/centres. */
export function snapFurniture(f: Furniture, p: Point, d: Design, snap: boolean, tol: number): { point: Point; guides: AlignmentGuide[] } {
  const grid: Point = [snapToStep(p[0]), snapToStep(p[1])];
  if (!snap) return { point: grid, guides: [] };
  const self = boxOf({ ...f, cx: p[0], cy: p[1] });
  const others = d.furniture.filter(o => o.id !== f.id).map(boxOf);
  const wall = wallSnapCandidates(f, p, d, tol);
  const point: Point = [...grid];
  const aligned: (0 | 1)[] = [];
  for (const i of [0, 1] as const) {
    const fc = furnitureCandidate(self, others, i, p[i], tol), wc = i === 0 ? wall.x : wall.y;
    if (fc && (!wc || fc.dist <= wc.dist)) { point[i] = fc.v; aligned.push(i); }
    else if (wc) point[i] = wc.v;
  }
  const placed: Box = { c: point, h: self.h };
  return { point, guides: aligned.flatMap(i => guidesFor(placed, others, i)) };
}

export const sameGuides = (a: AlignmentGuide[], b: AlignmentGuide[]) =>
  a.length === b.length && a.every((g, i) => g.axis === b[i].axis && g.at === b[i].at && g.from === b[i].from && g.to === b[i].to);
