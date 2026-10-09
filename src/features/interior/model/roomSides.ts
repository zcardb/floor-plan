import { faceGroup } from './dimensionBinding';
import { canResizeWall } from './wallPolicy';
import { moveStructureBand } from './structureBand';
import type { Design, Point } from './types';

/** 房间顶点来自墙面求交，与墙面之间允许的误差（mm），与 roomFollow 的贴合容差一致。 */
const faceEpsilon = 1.5;
/** 短于该长度的边视为退化（mm）。 */
const minSide = 1;
export const MIN_ROOM_SIDE = 100;
export const MAX_ROOM_SIDE = 100000;
export const ROOM_STRUCTURE_LOCKED = '此项目创建时锁定了结构尺寸，复制该项目后副本可自由调整。';
export type RoomSideAnchor = 'start' | 'end';
export type RoomSideFacing = 'up' | 'right' | 'down' | 'left' | 'slant';

export interface RoomSide {
  /** 规范顺序（最上偏左的顶点起、顺时针）下的序号，房间重建后仍指向同一条边。 */
  index: number;
  a: Point;
  b: Point;
  length: number;
  /** 0：横边（沿 x）；1：竖边（沿 y）；null：斜边。 */
  axis: 0 | 1 | null;
  /** 边所在直线的固定坐标（横边为 y，竖边为 x）。 */
  at: number;
  /** 沿 axis 的较小 / 较大坐标。 */
  start: number;
  end: number;
  /** 房间外侧朝向（墙所在的一侧）。 */
  facing: RoomSideFacing;
  /** start / end 端相邻边所贴的墙带，空数组表示开敞或无法识别。 */
  startWalls: string[];
  endWalls: string[];
  /** 只有一端可移动时，另一端必须固定。 */
  fixed?: RoomSideAnchor;
  /** 两端都可移动，由用户选择固定哪一端。 */
  chooseSide: boolean;
  reason?: string;
}

const sub = (p: Point, q: Point): Point => [p[0] - q[0], p[1] - q[1]];
const crossOf = (u: Point, v: Point) => u[0] * v[1] - u[1] * v[0];
const dist = (p: Point, q: Point) => Math.hypot(p[0] - q[0], p[1] - q[1]);
const signedArea = (ring: Point[]) => ring.reduce((s, p, i) => {
  const q = ring[(i + 1) % ring.length]!;
  return s + p[0] * q[1] - q[0] * p[1];
}, 0) / 2;

/** 去掉闭合点与重复点，合并共线顶点，统一为屏幕顺时针（y 向下），从最上偏左的顶点开始。 */
export function normalizedOutline(ring: Point[]): Point[] {
  let points = ring.filter((p, i) => dist(p, ring[(i + 1) % ring.length]!) >= minSide);
  let changed = true;
  while (changed && points.length > 3) {
    changed = false;
    for (let i = 0; i < points.length; i++) {
      const prev = points[(i - 1 + points.length) % points.length]!, p = points[i]!, next = points[(i + 1) % points.length]!;
      const u = sub(p, prev), v = sub(next, p);
      const lu = Math.hypot(u[0], u[1]), lv = Math.hypot(v[0], v[1]);
      if (lu < minSide || lv < minSide || Math.abs(crossOf(u, v)) / (lu * lv) < 1e-4) {
        points = points.filter((_, j) => j !== i);
        changed = true;
        break;
      }
    }
  }
  if (points.length < 3) return [];
  if (signedArea(points) < 0) points = [...points].reverse();
  const first = points.reduce((best, p, i) => {
    const q = points[best]!;
    return p[1] < q[1] - faceEpsilon || (Math.abs(p[1] - q[1]) <= faceEpsilon && p[0] < q[0]) ? i : best;
  }, 0);
  return [...points.slice(first), ...points.slice(0, first)];
}

const movable = (d: Design, ids: string[]) =>
  ids.length > 0 && ids.every(id => d.walls.some(w => w.id === id && canResizeWall(d, w) && !d.demolished.includes(id)));

function axisOf(a: Point, b: Point): 0 | 1 | null {
  if (Math.abs(a[1] - b[1]) <= faceEpsilon) return 0;
  if (Math.abs(a[0] - b[0]) <= faceEpsilon) return 1;
  return null;
}
/** 屏幕顺时针时，边的外法向为 (dy, -dx)。 */
function facingOf(a: Point, b: Point, axis: 0 | 1 | null): RoomSideFacing {
  if (axis === 0) return b[0] > a[0] ? 'up' : 'down';
  if (axis === 1) return b[1] > a[1] ? 'right' : 'left';
  return 'slant';
}

/** 房间外轮廓的逐边数据：长度、两端墙带与可编辑性。 */
export function roomSides(d: Design, roomId: string): RoomSide[] {
  const room = d.rooms.find(r => r.id === roomId);
  const ring = room?.rings[0];
  if (!ring) return [];
  const points = normalizedOutline(ring);
  const n = points.length;
  const walls = d.walls.filter(w => !d.demolished.includes(w.id));
  const locked = d.template !== 'blank' && d.structureUnlocked !== true;
  return points.map((a, index) => {
    const b = points[(index + 1) % n]!;
    const axis = axisOf(a, b), facing = facingOf(a, b, axis);
    const base = { index, a, b, length: dist(a, b), axis, facing, startWalls: [] as string[], endWalls: [] as string[], chooseSide: false };
    if (axis === null) return { ...base, at: 0, start: 0, end: 0, reason: '斜边不支持直接修改长度' };
    const cross = axis === 0 ? 1 : 0;
    const at = (a[cross] + b[cross]) / 2, start = Math.min(a[axis], b[axis]), end = Math.max(a[axis], b[axis]);
    /** 某一端相邻的垂直边所贴的墙带：墙在相邻边的房间外侧。 */
    const band = (vertex: 'a' | 'b') => {
      const neighbor = vertex === 'a'
        ? [points[(index - 1 + n) % n]!, a] as const
        : [b, points[(index + 2) % n]!] as const;
      if (axisOf(neighbor[0], neighbor[1]) !== (axis === 0 ? 1 : 0)) return [];
      const outward = facingOf(neighbor[0], neighbor[1], axis === 0 ? 1 : 0);
      const sign = outward === 'right' || outward === 'down' ? -1 : 1;
      const face = vertex === 'a' ? a[axis] : b[axis];
      const scan = (neighbor[0][cross] + neighbor[1][cross]) / 2;
      return faceGroup(walls, axis, face, scan, sign, faceEpsilon);
    };
    const aWalls = band('a'), bWalls = band('b');
    const aIsStart = a[axis] <= b[axis];
    const startWalls = aIsStart ? aWalls : bWalls, endWalls = aIsStart ? bWalls : aWalls;
    const side = { ...base, at, start, end, startWalls, endWalls };
    if (locked) return { ...side, reason: ROOM_STRUCTURE_LOCKED };
    const startMovable = movable(d, startWalls), endMovable = movable(d, endWalls);
    if (!startMovable && !endMovable) return { ...side, reason: '两端都是固定结构（外围墙、承重墙或开敞边界）' };
    return { ...side, fixed: !startMovable ? 'start' as const : !endMovable ? 'end' as const : undefined, chooseSide: startMovable && endMovable };
  });
}

/**
 * 改房间某条边的长度：沿该边方向平移一端所贴的墙带，房间随墙更新。
 * 所有计算基于传入的未修改设计；无法得到指定长度时整次抛错。
 */
export function editRoomSide(before: Design, roomId: string, index: number, requested: number, fixed: RoomSideAnchor): Design {
  const side = roomSides(before, roomId)[index];
  if (!side || side.axis === null) throw new Error('房间轮廓已变化，请重新打开尺寸');
  if (side.reason) throw new Error(side.reason);
  if (side.fixed && side.fixed !== fixed) throw new Error('固定结构一侧必须保持不动');
  if (!Number.isFinite(requested) || requested < MIN_ROOM_SIDE || requested > MAX_ROOM_SIDE)
    throw new Error('边长须在 0.10–100 m 之间');
  const updated = moveStructureBand(before, side as RoomSide & { axis: 0 | 1 }, requested, fixed);
  if (updated === before) return before;
  const match = roomSides(updated, roomId).some(s =>
    s.axis === side.axis && Math.abs(s.at - side.at) <= faceEpsilon && Math.abs(s.length - requested) <= faceEpsilon);
  if (!match) throw new Error('结构变化后无法得到指定边长，请检查连接关系');
  return updated;
}
