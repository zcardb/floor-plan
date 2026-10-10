import polygonClipping from 'polygon-clipping';
import { rebuildRooms, ringArea } from './geometry';
import { connectedWallPoly } from './wallConnections';
import { dropOpenRooms } from './roomEnclosure';
import { reconcileRoomsWithWalls } from './roomEnclosed';
import { dropOrphanFurniture } from './roomFurniture';
import { stripStrayHoles } from './roomHoles';
import { uid, type Design, type Point, type Room, type Wall } from './types';

/** 房间环贴合墙面的容差（mm）。 */
const faceEpsilon = 1.5;
/** 房间环最小面积（mm²），与 rebuildRooms 的过滤阈值一致。 */
const minRoomArea = 10000;
const brokenRooms = '该调整会破坏房间划分';

type Line = { a: Point; b: Point };
/** 一面墙的某一侧：origin 对应墙起点 a，沿 dir 延伸 length。 */
interface Face { origin: Point; dir: Point; normal: Point; length: number }
interface Fit { before: Face; after: Face; moved: boolean }

const sub = (p: Point, q: Point): Point => [p[0] - q[0], p[1] - q[1]];
const add = (p: Point, v: Point, k = 1): Point => [p[0] + v[0] * k, p[1] + v[1] * k];
const dot = (p: Point, q: Point) => p[0] * q[0] + p[1] * q[1];
const crossOf = (u: Point, v: Point) => u[0] * v[1] - u[1] * v[0];
const cross = (o: Point, p: Point, q: Point) => crossOf(sub(p, o), sub(q, o));
const unit = (v: Point): Point | undefined => {
  const n = Math.hypot(v[0], v[1]);
  return n > 1e-9 ? [v[0] / n, v[1] / n] : undefined;
};
const sameWall = (a: Wall, b: Wall) =>
  a.a[0] === b.a[0] && a.a[1] === b.a[1] && a.b[0] === b.b[0] && a.b[1] === b.b[1] && a.thickness === b.thickness;
const lineOf = (face: Face): Line => ({ a: face.origin, b: add(face.origin, face.dir) });

function faceOf(wall: Wall, side: -1 | 1): Face | undefined {
  const dir = unit(sub(wall.b, wall.a));
  if (!dir) return undefined;
  const normal: Point = [-dir[1], dir[0]];
  return { origin: add(wall.a, normal, (side * wall.thickness) / 2), dir, normal, length: Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]) };
}
const distanceToFace = (p: Point, face: Face) => Math.abs(crossOf(face.dir, sub(p, face.origin)));

/** 沿 direction 从 p 出发与直线求交 */
function castOnto(p: Point, direction: Point, line: Line): Point | undefined {
  const d = sub(line.b, line.a), denominator = crossOf(direction, d);
  if (Math.abs(denominator) < 1e-9) return undefined;
  return add(p, direction, crossOf(sub(line.a, p), d) / denominator);
}

/** 环边贴合的墙面：两端都落在旧墙面直线上，且沿墙方向与墙段有实际重叠；重叠最长者胜出。 */
function matchFace(a: Point, b: Point, fits: Fit[]): Fit | undefined {
  if (Math.hypot(b[0] - a[0], b[1] - a[1]) < faceEpsilon) return undefined;
  let best: { fit: Fit; overlap: number } | undefined;
  for (const fit of fits) {
    const face = fit.before;
    if (distanceToFace(a, face) > faceEpsilon || distanceToFace(b, face) > faceEpsilon) continue;
    const t1 = dot(sub(a, face.origin), face.dir), t2 = dot(sub(b, face.origin), face.dir);
    const overlap = Math.min(Math.max(t1, t2), face.length) - Math.max(Math.min(t1, t2), 0);
    if (overlap <= faceEpsilon) continue;
    if (!best || overlap > best.overlap) best = { fit, overlap };
  }
  return best?.fit;
}

/** 顶点新位置；两侧贴合墙面都未变化时返回原点。 */
function followVertex(point: Point, next: Point, previous: Point, fits: Fit[]): Point {
  const forward = matchFace(point, next, fits), backward = matchFace(previous, point, fits);
  if (!forward?.moved && !backward?.moved) return point;
  if (forward && backward) {
    const meet = castOnto(forward.after.origin, forward.after.dir, lineOf(backward.after));
    if (meet) return meet;
    // 两侧共线：沿旧墙面法向落到移动后的墙面上
    const moved = forward.moved ? forward : backward;
    return castOnto(point, moved.before.normal, lineOf(moved.after)) ?? point;
  }
  const attached = (forward ?? backward)!;
  // 另一侧是自由边（开敞空间分界）：沿自由边方向滑到新墙面，保持分界线方向不变
  const free = unit(forward ? sub(previous, point) : sub(next, point));
  const slid = free && castOnto(point, free, lineOf(attached.after));
  const placed = slid ?? castOnto(point, attached.before.normal, lineOf(attached.after));
  if (!placed) throw new Error(brokenRooms);
  return placed;
}

function signedArea(ring: Point[]) {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!, q = ring[(i + 1) % ring.length]!;
    sum += p[0] * q[1] - q[0] * p[1];
  }
  return sum / 2;
}
function selfIntersects(ring: Point[]) {
  const n = ring.length;
  const crosses = (p1: Point, p2: Point, q1: Point, q2: Point) =>
    cross(p1, p2, q1) * cross(p1, p2, q2) < -1e-6 && cross(q1, q2, p1) * cross(q1, q2, p2) < -1e-6;
  for (let i = 0; i < n; i++)
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (crosses(ring[i]!, ring[(i + 1) % n]!, ring[j]!, ring[(j + 1) % n]!)) return true;
    }
  return false;
}
/** 退化：本来不共线的相邻三点变得共线（房间某一角被压平） */
function degenerates(before: Point[], after: Point[]) {
  const n = after.length;
  const flat = (ring: Point[], i: number) => Math.abs(cross(ring[i]!, ring[(i + 1) % n]!, ring[(i + 2) % n]!)) < 1e-3;
  for (let i = 0; i < n; i++) if (flat(after, i) && !flat(before, i)) return true;
  return false;
}
function assertHealthy(before: Point[], after: Point[]) {
  if (after.some(p => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) throw new Error(brokenRooms);
  if (ringArea(after) < minRoomArea) throw new Error(brokenRooms);
  if (Math.sign(signedArea(after)) !== Math.sign(signedArea(before))) throw new Error(brokenRooms);
  if (selfIntersects(after) || degenerates(before, after)) throw new Error(brokenRooms);
}

/**
 * 墙体几何变化后，让房间边界跟着墙面移动。
 * 房间的 id、名称、地面与墙面材质、计价开关、数量与顺序全部保留，只移动顶点。
 * 无法保持合法房间（退化、翻转、自交）时抛错，调用方整次取消编辑。
 */
export function followRooms(before: Design, after: Design): Design {
  const fits: Fit[] = [];
  for (const wall of after.walls) {
    const previous = before.walls.find(w => w.id === wall.id);
    if (!previous) continue;
    const moved = !sameWall(previous, wall);
    for (const side of [1, -1] as const) {
      const oldFace = faceOf(previous, side), newFace = faceOf(wall, side);
      if (oldFace && newFace) fits.push({ before: oldFace, after: newFace, moved });
    }
  }
  if (!fits.some(fit => fit.moved)) return after;
  const rooms: Room[] = after.rooms.map(room => ({
    ...room,
    rings: room.rings.map(ring => {
      if (ring.length < 3) throw new Error(brokenRooms);
      const moved = ring.map((point, i) =>
        followVertex(point, ring[(i + 1) % ring.length]!, ring[(i - 1 + ring.length) % ring.length]!, fits));
      assertHealthy(ring, moved);
      return moved;
    }),
  }));
  return { ...after, rooms };
}

const openRing = (ring: Point[]) => {
  const first = ring[0], last = ring[ring.length - 1];
  return ring.length > 1 && first && last && first[0] === last[0] && first[1] === last[1] ? ring.slice(0, -1) : ring;
};
const pieceArea = (rings: Point[][]) => ringArea(rings[0]!) - rings.slice(1).reduce((s, r) => s + ringArea(r), 0);
function freeName(base: string, taken: Set<string>) {
  for (let i = 2; ; i++) if (!taken.has(`${base} ${i}`)) return `${base} ${i}`;
}

/**
 * 非空白户型新增一面墙后，只切开与墙相交的房间；其余房间原样保留。
 * 面积最大的一块继承原房间全部属性，其余块作为新房间追加（同材质，名称加序号）。
 * 切出来的轮廓可能带回墙带碎洞，最后统一清掉。
 */
export function splitRoomsWithWall(d: Design, wallId: string): Design {
  const wall = d.walls.find(w => w.id === wallId);
  if (!wall) return d;
  const cut = connectedWallPoly(wall, d.walls, d.demolished);
  const names = new Set(d.rooms.map(r => r.name));
  const kept: Room[] = [], added: Room[] = [];
  for (const room of d.rooms) {
    const pieces = polygonClipping.difference(room.rings, [cut])
      .map(poly => poly.map(r => openRing(r as Point[])))
      .filter(rings => rings[0]!.length >= 3 && pieceArea(rings) > minRoomArea)
      .sort((a, b) => pieceArea(b) - pieceArea(a));
    if (pieces.length < 2) { kept.push(room); continue; }
    kept.push({ ...room, rings: pieces[0]! });
    for (const rings of pieces.slice(1)) {
      const name = freeName(room.name, names);
      names.add(name);
      added.push({ id: uid(), name, rings, mat: room.mat, wallMat: room.wallMat, counted: room.counted });
    }
  }
  return added.length ? stripStrayHoles({ ...d, rooms: [...kept, ...added] }) : d;
}

/**
 * 改墙后的房间同步：空白户型按外框重算，其余项目让房间跟随墙面。
 * 这次改动让某个房间不再被墙围住时，该房间和里面的家具随之删除；
 * 被墙隔开的房间拆成多个，墙围出了不属于任何房间的区域时，补成新房间。
 */
export function syncRooms(before: Design, after: Design): Design {
  const synced = after.template === 'blank' ? rebuildRooms(after) : followRooms(before, after);
  const dropped = dropOpenRooms(synced, before);
  const kept = dropped === synced ? dropped : dropOrphanFurniture(before, dropped);
  return reconcileRoomsWithWalls(kept);
}
