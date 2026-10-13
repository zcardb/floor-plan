import { length, nearestOnWall } from './geometry';
import { combineCollinearWalls } from './wall-merge';
import { splitTolerance as tolerance } from './wall-split';
import { isBearingWall } from './wall-policy';
import type { Design, Point, Wall } from './types';

const same = (p: Point, q: Point) => Math.hypot(p[0] - q[0], p[1] - q[1]) < tolerance;
const distance = (p: Point, w: Wall) => {
  const q = nearestOnWall(p, w).point;
  return Math.hypot(p[0] - q[0], p[1] - q[1]);
};
const collinear = (x: Wall, y: Wall) => {
  const L = length(x), dx = (x.b[0] - x.a[0]) / L, dy = (x.b[1] - x.a[1]) / L;
  return [y.a, y.b].every(p => Math.abs((p[0] - x.a[0]) * dy - (p[1] - x.a[1]) * dx) < tolerance);
};
/** 属性一致才合并：类型、厚度、颜色、外墙来源都相同（与「合并墙段」的条件一致）。 */
const compatible = (x: Wall, y: Wall) =>
  x.kind === y.kind && Math.abs(x.thickness - y.thickness) < tolerance && x.color === y.color && x.exteriorRootId === y.exteriorRootId;

/**
 * 删除墙 removed 后，清掉它在相连墙上留下的分割点：
 * 共线、首尾相接、属性一致的两段墙，接点紧贴被删的墙且已没有其他墙接在这里时，合并回一面墙。
 * 合并会让门窗重叠或越界时保持原样。
 */
export function healSplitsAround(design: Design, removed: Wall): Design {
  let d = design;
  for (let guard = 0; guard < 8; guard++) {
    const walls = d.walls.filter(w => !d.demolished.includes(w.id) && length(w) >= tolerance);
    let pair: [Wall, Wall, Point] | undefined;
    for (const x of walls) {
      for (const y of walls) {
        if (x === y || !compatible(x, y) || !collinear(x, y)) continue;
        const q = [x.a, x.b].find(p => same(p, y.a) || same(p, y.b));
        if (!q || distance(q, removed) > (removed.thickness + x.thickness) / 2 + 1) continue;
        // 首尾相接而不是重叠：两段分处接点两侧。
        const far = (w: Wall) => (same(w.a, q) ? w.b : w.a);
        const fx = far(x), fy = far(y);
        if ((fx[0] - q[0]) * (fy[0] - q[0]) + (fx[1] - q[1]) * (fy[1] - q[1]) >= 0) continue;
        const busy = walls.some(o => o !== x && o !== y && distance(q, o) <= Math.max(o.thickness, x.thickness) / 2 + 1);
        if (!busy) { pair = [x, y, q]; break; }
      }
      if (pair) break;
    }
    if (!pair) return d;
    const [x, y] = pair;
    // 保留靠 A 端的原墙 id（分割时原 id 留在 A 段）。
    const keep = same(x.b, y.a) ? x : same(y.b, x.a) ? y : length(x) >= length(y) ? x : y;
    try {
      d = combineCollinearWalls(d, [x, y], { ...keep, loadBearing: isBearingWall(x) || isBearingWall(y) || undefined }).design;
    } catch {
      return d;
    }
  }
  return d;
}
