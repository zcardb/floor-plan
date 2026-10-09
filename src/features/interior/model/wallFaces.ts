import { moveStructureBand } from './structureBand';
import { center, inRing, inRoom, length, wallPoly } from './geometry';
import type { Design, Point, Wall } from './types';

/** 墙面探测距离（mm）：墙体表面以外多远取点判断那一侧有没有房间。 */
const PROBE = 25;

/**
 * 墙体朝向房间的一侧：只有一侧有房间时为 1（法向正向）或 -1（法向负向），
 * 两侧都有房间（隔墙）或都没有时为 undefined，保持原位置。
 */
export function roomFaceSide(d: Design, wall: Wall): 1 | -1 | undefined {
  if (length(wall) < 0.01) return undefined;
  const u: Point = [(wall.b[0] - wall.a[0]) / length(wall), (wall.b[1] - wall.a[1]) / length(wall)];
  const n: Point = [-u[1], u[0]];
  const mid: Point = [(wall.a[0] + wall.b[0]) / 2, (wall.a[1] + wall.b[1]) / 2];
  const hasRoom = (side: 1 | -1) => {
    const p: Point = [mid[0] + n[0] * side * (wall.thickness / 2 + PROBE), mid[1] + n[1] * side * (wall.thickness / 2 + PROBE)];
    return d.rooms.some(r => inRoom(p, r)) && !d.walls.some(w => w.id !== wall.id && !d.demolished.includes(w.id) && inRing(p, wallPoly(w)));
  };
  const plus = hasRoom(1), minus = hasRoom(-1);
  if (plus === minus) return undefined;
  return plus ? 1 : -1;
}

/**
 * 改墙厚：房间一侧的表面保持不动，厚度差全部推到另一侧。
 * 两侧都有房间（隔墙）时维持原中心线，两侧各变化一半。
 */
export function withAlignedThickness(d: Design, wall: Wall, thickness: number): Wall {
  const delta = thickness - wall.thickness;
  if (Math.abs(delta) < 0.001) return wall;
  const side = roomFaceSide(d, wall);
  if (!side) {
    const u: Point = [(wall.b[0] - wall.a[0]) / length(wall), (wall.b[1] - wall.a[1]) / length(wall)];
    const n: Point = [-u[1], u[0]];
    const shift = (delta * side0(delta)) / 2;
    return { ...wall, thickness, a: [wall.a[0] + n[0] * shift, wall.a[1] + n[1] * shift], b: [wall.b[0] + n[0] * shift, wall.b[1] + n[1] * shift] };
  }
  const u: Point = [(wall.b[0] - wall.a[0]) / length(wall), (wall.b[1] - wall.a[1]) / length(wall)];
  const n: Point = [-u[1], u[0]];
  const shift = -side * delta / 2;
  return { ...wall, thickness, a: [wall.a[0] + n[0] * shift, wall.a[1] + n[1] * shift], b: [wall.b[0] + n[0] * shift, wall.b[1] + n[1] * shift] };
}
