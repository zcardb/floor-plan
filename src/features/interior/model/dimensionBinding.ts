import { nearestOnWall } from './geometry';
import type { Point, Wall } from './types';
export interface DimensionBinding {
  axis: 0 | 1; start: number; end: number; sourceAt: number;
  startWalls: string[]; endWalls: string[];
}
const tolerance = 0.05;
/** A structural face must belong to exactly one continuous, equal-thickness wall band. */
function faceGroup(walls: Wall[], axis: 0 | 1, face: number, scan: number, sign: -1 | 1): string[] {
  const cross = axis === 0 ? 1 : 0;
  const matches = walls.filter(w => Math.abs(w.a[axis] - w.b[axis]) < tolerance &&
    Math.abs(w.a[axis] + sign * w.thickness / 2 - face) < tolerance &&
    scan >= Math.min(w.a[cross], w.b[cross]) - tolerance && scan <= Math.max(w.a[cross], w.b[cross]) + tolerance);
  if (!matches.length) return [];
  const origin = matches[0];
  if (matches.some(w => Math.abs(w.a[axis] - origin.a[axis]) > tolerance || Math.abs(w.thickness - origin.thickness) > tolerance)) return [];
  const result = new Set(matches.map(w => w.id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const w of walls) {
      if (result.has(w.id) || Math.abs(w.a[axis] - w.b[axis]) > tolerance ||
        Math.abs(w.a[axis] - origin.a[axis]) > tolerance || Math.abs(w.thickness - origin.thickness) > tolerance) continue;
      if (walls.some(other => result.has(other.id) && Math.min(Math.max(w.a[cross], w.b[cross]), Math.max(other.a[cross], other.b[cross])) >=
        Math.max(Math.min(w.a[cross], w.b[cross]), Math.min(other.a[cross], other.b[cross])) - tolerance)) {
        result.add(w.id); changed = true;
      }
    }
  }
  return [...result].sort();
}
export function dimensionBinding(walls: Wall[], horizontal: boolean, start: number, end: number, sourceAt: number): DimensionBinding | undefined {
  const axis = horizontal ? 0 : 1;
  const startWalls = faceGroup(walls, axis, start, sourceAt, 1);
  const endWalls = faceGroup(walls, axis, end, sourceAt, -1);
  if (!startWalls.length || !endWalls.length || startWalls.some(id => endWalls.includes(id))) return;
  const mid: Point = horizontal ? [(start + end) / 2, sourceAt] : [sourceAt, (start + end) / 2];
  if (walls.some(w => {
    const p = nearestOnWall(mid, w).point;
    return Math.hypot(p[0] - mid[0], p[1] - mid[1]) < w.thickness / 2 - tolerance;
  })) return;
  return { axis, start, end, sourceAt, startWalls, endWalls };
}
