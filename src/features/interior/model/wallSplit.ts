import { length } from './geometry';
import { uid, type Design, type Point, type Wall } from './types';

export const splitTolerance = 0.01;
export function wallSplitIntervals(design: Design, wallId: string, cuts: number[]): number[] {
  const wall = design.walls.find(w => w.id === wallId);
  if (!wall) throw new Error('墙体已不存在，请重新选择');
  if (design.demolished.includes(wallId)) throw new Error('请先撤销墙体拆除，再分割墙段');
  if (cuts.length < 1 || cuts.length > 2 || cuts.some(c => !Number.isFinite(c))) throw new Error('请输入一个或两个有效分割距离');
  if (design.walls.length + cuts.length > 2000) throw new Error('分割后墙段不能超过 2000 段');
  const L = length(wall);
  const openings = design.openings.filter(o => o.wallId === wallId);
  // Snap only near opening edges, so boundary ownership never creates a sliver of an opening.
  const points = cuts.map(c => {
    for (const o of openings) for (const edge of [o.offset - o.width / 2, o.offset + o.width / 2]) {
      if (Math.abs(c - edge) <= splitTolerance) return edge;
    }
    return c;
  });
  const intervals = [0, ...points, L];
  if (!Number.isFinite(L) || intervals.some((c, i) => i > 0 && c - intervals[i - 1] < 50)) throw new Error('分割点须从 A 递增，每段至少 0.05 m');
  if (points.some(c => openings.some(o => c > o.offset - o.width / 2 && c < o.offset + o.width / 2))) throw new Error('分割点位于门窗洞口内部，请调整位置');
  return intervals;
}

export function splitWall(design: Design, wallId: string, cuts: number[], selectedSegment = 0): { design: Design; selectedId: string } {
  const intervals = wallSplitIntervals(design, wallId, cuts);
  if (!Number.isInteger(selectedSegment) || selectedSegment < 0 || selectedSegment >= intervals.length - 1) throw new Error('请选择有效的结果墙段');
  const wall = design.walls.find(w => w.id === wallId)!;
  const L = length(wall);
  const point = (distance: number): Point => distance === 0 ? wall.a : distance === L ? wall.b : [wall.a[0] + (wall.b[0] - wall.a[0]) * distance / L, wall.a[1] + (wall.b[1] - wall.a[1]) * distance / L];
  const used = new Set([...design.walls, ...design.openings, ...design.rooms, ...design.furniture, ...design.measures].map(o => o.id));
  const segments: Wall[] = intervals.slice(0, -1).map((start, i) => {
    let id = wall.id;
    if (i) { do { id = uid(); } while (used.has(id)); used.add(id); }
    return { ...wall, id, a: point(start), b: point(intervals[i + 1]), ...(wall.kind === 'exterior' ? { exteriorRootId: wall.exteriorRootId || wall.id } : {}) };
  });
  const openings = design.openings.map(o => {
    if (o.wallId !== wallId) return o;
    const index = segments.findIndex((_, i) => o.offset - o.width / 2 >= intervals[i] - splitTolerance && o.offset + o.width / 2 <= intervals[i + 1] + splitTolerance);
    if (index < 0) throw new Error('门窗无法完整迁移，请调整分割点');
    return { ...o, wallId: segments[index].id, offset: o.offset - intervals[index] };
  });
  return { design: { ...design, walls: design.walls.flatMap(w => w.id === wallId ? segments : [w]), openings }, selectedId: segments[selectedSegment].id };
}
