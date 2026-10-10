import { length } from './geometry';
import type { Design, Opening, Point, Wall } from './types';

const EPS = 0.01;
const same = (p: Point, q: Point) => Math.abs(p[0] - q[0]) < EPS && Math.abs(p[1] - q[1]) < EPS;

/** 墙端点变化后门窗的新 offset：只动 A 端时保持到 B 端的距离；两端都动时取原中心点在新墙上的投影。 */
function anchoredOffset(o: Opening, old: Wall, now: Wall): number {
  if (same(old.a, now.a)) return o.offset;
  const L0 = length(old), L1 = length(now);
  if (same(old.b, now.b)) return L1 - (L0 - o.offset);
  const p: Point = [old.a[0] + (old.b[0] - old.a[0]) * o.offset / L0, old.a[1] + (old.b[1] - old.a[1]) * o.offset / L0];
  return ((p[0] - now.a[0]) * (now.b[0] - now.a[0]) + (p[1] - now.a[1]) * (now.b[1] - now.a[1])) / L1;
}

/**
 * 墙被延长、缩短或平移后，墙上门窗留在原来的位置（不随 A 端一起滑动）。
 * 只处理 before → after 中仍在同一面墙上的门窗；墙段被拆分、合并而换了宿主的门窗保持 after 的结果。
 */
export function keepOpeningsInPlace(before: Design, after: Design): Design {
  const oldWalls = new Map(before.walls.map(w => [w.id, w]));
  const newWalls = new Map(after.walls.map(w => [w.id, w]));
  const oldOpenings = new Map(before.openings.map(o => [o.id, o]));
  let changed = false;
  const openings = after.openings.map(o => {
    const prev = oldOpenings.get(o.id), old = oldWalls.get(o.wallId), now = newWalls.get(o.wallId);
    if (!prev || prev.wallId !== o.wallId || !old || !now || old === now) return o;
    if (same(old.a, now.a) && same(old.b, now.b)) return o;
    if (length(old) < EPS || length(now) < EPS) return o;
    const offset = anchoredOffset(prev, old, now);
    if (Math.abs(offset - o.offset) < EPS) return o;
    changed = true;
    return { ...o, offset };
  });
  return changed ? { ...after, openings } : after;
}

/** 门窗都还完整落在所在墙段内。 */
export function openingsFitWalls(d: Design, wallIds?: Iterable<string>): boolean {
  const ids = wallIds ? new Set(wallIds) : null;
  return d.openings.every(o => {
    if (ids && !ids.has(o.wallId)) return true;
    const w = d.walls.find(w => w.id === o.wallId);
    return !w || (o.offset - o.width / 2 >= -EPS && o.offset + o.width / 2 <= length(w) + EPS);
  });
}
