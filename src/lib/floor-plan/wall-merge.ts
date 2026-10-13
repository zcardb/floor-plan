import { length } from './geometry';
import { splitTolerance as tolerance } from './wall-split';
import { isBearingWall } from './wall-policy';
import { doorOrientation } from './door-orientation';
import type { Design, Point, Wall } from './types';

export function wallMergeGroup(design: Design, id: string): Wall[] {
  const wall = design.walls.find(w => w.id === id);
  if (!wall || design.demolished.includes(id)) return [];
  const L = length(wall);
  if (L < tolerance) return [];
  const dx = (wall.b[0] - wall.a[0]) / L, dy = (wall.b[1] - wall.a[1]) / L;
  const project = (p: Point) => (p[0] - wall.a[0]) * dx + (p[1] - wall.a[1]) * dy;
  const candidates = design.walls.filter(w => !design.demolished.includes(w.id) && w.kind === wall.kind &&
    Math.abs(w.thickness - wall.thickness) < tolerance && w.color === wall.color && w.exteriorRootId === wall.exteriorRootId &&
    [w.a, w.b].every(p => Math.abs((p[0] - wall.a[0]) * dy - (p[1] - wall.a[1]) * dx) < tolerance))
    .map(w => ({ w, lo: Math.min(project(w.a), project(w.b)), hi: Math.max(project(w.a), project(w.b)) }));
  const group = [candidates.find(c => c.w.id === id)!];
  let lo = 0, hi = L;
  for (;;) {
    const neighbors = candidates.filter(c => !group.includes(c) && (Math.abs(c.hi - lo) < tolerance || Math.abs(c.lo - hi) < tolerance));
    if (!neighbors.length) break;
    // Do not choose a branch or hide overlapping centerlines.
    if (neighbors.some(c => candidates.some(other => other !== c && Math.min(c.hi, other.hi) - Math.max(c.lo, other.lo) > tolerance))) break;
    if (neighbors.filter(c => Math.abs(c.hi - lo) < tolerance).length > 1 || neighbors.filter(c => Math.abs(c.lo - hi) < tolerance).length > 1) break;
    group.push(...neighbors); lo = Math.min(lo, ...neighbors.map(c => c.lo)); hi = Math.max(hi, ...neighbors.map(c => c.hi));
  }
  return group.length > 1 ? group.map(c => c.w) : [];
}

export function mergeWall(design: Design, id: string): { design: Design; selectedId: string } {
  const walls = wallMergeGroup(design, id);
  if (walls.length < 2) throw new Error('没有可合并的同类型、同厚度、同颜色连续墙段');
  const selected = walls.find(w => w.id === id)!;
  const ids = new Set(walls.map(w => w.id));
  const root = selected.exteriorRootId;
  const complete = !!root && design.walls.filter(w => w.exteriorRootId === root).every(w => ids.has(w.id));
  const restored = complete && !design.walls.some(w => w.id === root && !ids.has(w.id));
  const base: Wall = { ...selected, id: restored ? root! : id, loadBearing: walls.some(isBearingWall) };
  if (restored) delete base.exteriorRootId;
  return combineCollinearWalls(design, walls, base);
}

/**
 * 把一组共线墙段替换为一面墙：几何取整组两端，其余属性取 base（含 id）；墙上门窗换算到新墙并校验不重叠、不越界。
 * 新墙放在原组第一段的位置，避免打乱墙体顺序。
 */
export function combineCollinearWalls(design: Design, walls: Wall[], base: Wall): { design: Design; selectedId: string } {
  const L = length(base), dx = (base.b[0] - base.a[0]) / L, dy = (base.b[1] - base.a[1]) / L;
  const project = (p: Point) => (p[0] - base.a[0]) * dx + (p[1] - base.a[1]) * dy;
  const endpoints = walls.flatMap(w => [w.a, w.b]).sort((a, b) => project(a) - project(b));
  const ids = new Set(walls.map(w => w.id));
  const merged: Wall = { ...base, a: endpoints[0], b: endpoints[endpoints.length - 1] };
  const openings = design.openings.map(o => {
    if (!ids.has(o.wallId)) return o;
    const old = walls.find(w => w.id === o.wallId)!, oldL = length(old);
    const point: Point = [old.a[0] + (old.b[0] - old.a[0]) * o.offset / oldL, old.a[1] + (old.b[1] - old.a[1]) * o.offset / oldL];
    const offset = (point[0] - merged.a[0]) * dx + (point[1] - merged.a[1]) * dy;
    const reversed = (old.b[0] - old.a[0]) * dx + (old.b[1] - old.a[1]) * dy < 0;
    const orientation = doorOrientation(o);
    return { ...o, wallId: merged.id, offset, ...(reversed && o.kind === 'door' ? { hinge: orientation.hinge === 'start' ? 'end' as const : 'start' as const, swingSide: -orientation.swingSide as -1 | 1 } : {}) };
  });
  const hosted = openings.filter(o => o.wallId === merged.id).sort((a, b) => a.offset - b.offset);
  if (hosted.some((o, i) => o.offset - o.width / 2 < -tolerance || o.offset + o.width / 2 > length(merged) + tolerance ||
    (i > 0 && hosted[i - 1].offset + hosted[i - 1].width / 2 > o.offset - o.width / 2 + tolerance))) throw new Error('合并后门窗洞口重叠或超出墙体');
  let inserted = false;
  return { design: { ...design, openings, walls: design.walls.flatMap(w => {
    if (!ids.has(w.id)) return [w];
    if (inserted) return []; inserted = true; return [merged];
  }) }, selectedId: merged.id };
}
