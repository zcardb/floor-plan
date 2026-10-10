import polygonClipping from 'polygon-clipping';
import { canResizeWall } from './wallPolicy';
import { syncRooms } from './roomFollow';
import { bbox, length, nearestOnWall, rect, ringArea, wallPoly } from './geometry';
import { validateWallSegment } from './wallDrawing';
import type { Design, Point, Wall } from './types';

const epsilon = 0.05;
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * 一条结构尺寸：两侧的墙带（沿 axis 垂直方向的坐标 start / end），
 * startWalls 贴在 start 面、endWalls 贴在 end 面。两侧都为开敞（空数组）时该尺寸只读。
 */
export interface StructureBand {
  axis: 0 | 1;
  start: number;
  end: number;
  startWalls: string[];
  endWalls: string[];
}

const movable = (d: Design, ids: string[]) => ids.length > 0 && ids.every(id => d.walls.some(w => w.id === id && canResizeWall(d, w) && !d.demolished.includes(id)));

function intersectionArea(a: Wall, b: Wall) {
  return polygonClipping.intersection([wallPoly(a)], [wallPoly(b)]).reduce((sum, poly) => sum + ringArea(poly[0] as Point[]) - poly.slice(1).reduce((s, ring) => s + ringArea(ring as Point[]), 0), 0);
}

/**
 * 沿 axis 平移 band 某一侧的墙带，让两侧净距变成 requested。
 * 目标墙整体平移，与它相连的墙端点同步伸缩；门窗随所属墙移动，连接墙上的门窗保持世界位置。
 * 只有宽度和两侧墙带已变化的墙会被改动；任何一处无法保持合法结构就整次抛错。
 */
export function moveStructureBand(before: Design, band: StructureBand, requested: number, fixed: 'start' | 'end'): Design {
  const { axis } = band;
  if (!Number.isFinite(requested) || requested <= 0 || requested > 100000) throw new Error('请输入大于0且不超过100 m的净距离');
  const delta = (requested - (band.end - band.start)) * (fixed === 'start' ? 1 : -1);
  if (Math.abs(delta) < 0.001) return before;
  const targetIds = new Set(fixed === 'start' ? band.endWalls : band.startWalls);
  if (!movable(before, [...targetIds])) throw new Error('目标墙体不可移动');
  const targets = before.walls.filter(w => targetIds.has(w.id));
  const translate = (p: Point): Point => axis === 0 ? [p[0] + delta, p[1]] : [p[0], p[1] + delta];
  const changed = new Set<string>();
  const walls = before.walls.map(w => {
    if (targetIds.has(w.id)) { changed.add(w.id); return { ...w, a: translate(w.a), b: translate(w.b) }; }
    if (before.demolished.includes(w.id)) return w;
    const aConnected = targets.some(target => distance(nearestOnWall(w.a, target).point, w.a) < epsilon);
    const bConnected = targets.some(target => distance(nearestOnWall(w.b, target).point, w.b) < epsilon);
    if (!aConnected && !bConnected) return w;
    // A moving wall may slide along the INTERIOR of a fixed wall; its endpoint
    // does not require changing that fixed wall. A fixed endpoint joint cannot.
    if (!canResizeWall(before, w)) throw new Error('该移动会改变承重墙的连接端点');
    const next = { ...w, a: aConnected ? translate(w.a) : w.a, b: bConnected ? translate(w.b) : w.b };
    if (Math.abs(w.a[0] - w.b[0]) < epsilon && Math.abs(next.a[0] - next.b[0]) >= epsilon ||
      Math.abs(w.a[1] - w.b[1]) < epsilon && Math.abs(next.a[1] - next.b[1]) >= epsilon) throw new Error('该连接无法保持原墙体方向');
    changed.add(w.id); return next;
  });
  const nextById = new Map(walls.map(w => [w.id, w]));
  for (const original of before.walls.filter(w => changed.has(w.id))) {
    const next = nextById.get(original.id)!;
    if (length(next) < 100 || (next.b[0] - next.a[0]) * (original.b[0] - original.a[0]) + (next.b[1] - next.a[1]) * (original.b[1] - original.a[1]) <= 0)
      throw new Error('移动会使连接墙反向或短于0.1 m');
    if (targetIds.has(original.id)) for (const key of ['a', 'b'] as const) {
      for (const fixedWall of before.walls.filter(w => !changed.has(w.id) && !before.demolished.includes(w.id))) {
        if (distance(nearestOnWall(original[key], fixedWall).point, original[key]) < epsilon &&
          distance(nearestOnWall(next[key], fixedWall).point, next[key]) >= epsilon) throw new Error('移动后无法保持与固定墙的连接');
      }
    }
  }
  const openings = before.openings.map(o => {
    if (!changed.has(o.wallId) || targetIds.has(o.wallId)) return o;
    const original = before.walls.find(w => w.id === o.wallId)!, next = nextById.get(o.wallId)!;
    const L = length(original), oldPoint: Point = [original.a[0] + (original.b[0] - original.a[0]) * o.offset / L,
      original.a[1] + (original.b[1] - original.a[1]) * o.offset / L];
    const projection = nearestOnWall(oldPoint, next);
    if (distance(projection.point, oldPoint) > epsilon) throw new Error('连接墙变化后无法保持门窗位置');
    return { ...o, offset: projection.offset };
  });
  const candidate: Design = { ...before, walls, openings };
  for (const id of changed) {
    const wall = nextById.get(id)!;
    validateWallSegment(candidate, wall.a, wall.b, id);
    for (const o of openings.filter(o => o.wallId === id)) {
      if (o.offset - o.width / 2 < -epsilon || o.offset + o.width / 2 > length(wall) + epsilon ||
        openings.some(other => other.id !== o.id && other.wallId === id && Math.abs(other.offset - o.offset) < (other.width + o.width) / 2 - epsilon))
        throw new Error('墙体变化后无法容纳门窗或门窗重叠');
    }
    for (const other of walls) {
      if (other.id === id || before.demolished.includes(other.id)) continue;
      const oldWall = before.walls.find(w => w.id === id)!, oldOther = before.walls.find(w => w.id === other.id)!;
      const newArea = intersectionArea(wall, other), oldArea = intersectionArea(oldWall, oldOther);
      if (newArea > 1 && oldArea <= 1) throw new Error('移动会穿过或重叠其他墙体');
    }
  }
  // Reject passing completely THROUGH a wall even if final footprints do not overlap.
  for (const target of targets) {
    const next = nextById.get(target.id)!;
    const sweepBounds = bbox([...wallPoly(target), ...wallPoly(next)]);
    const sweep = rect(sweepBounds.x, sweepBounds.y, sweepBounds.x2 - sweepBounds.x, sweepBounds.y2 - sweepBounds.y);
    for (const other of before.walls) {
      if (targetIds.has(other.id) || before.demolished.includes(other.id) || intersectionArea(target, other) > 1) continue;
      const crossed = polygonClipping.intersection([sweep], [wallPoly(other)]).some(poly => ringArea(poly[0] as Point[]) > 1);
      if (crossed) throw new Error('目标墙不能跨过其他墙体');
    }
  }
  return syncRooms(before, candidate);
}
