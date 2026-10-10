import { length, nearestOnWall } from './geometry';
import { canResizeWall } from './wallPolicy';
import { keepOpeningsInPlace, openingsFitWalls } from './openingAnchor';
import type { Design, Point, Wall } from './types';

/** 移墙后墙段（含被带动的连接墙）的最短长度（mm）。 */
const MIN_LENGTH = 100;
/** 导向墙与被移动墙夹角的正弦下限：更平行的墙不能作为端点滑轨。 */
const MIN_ANGLE_SIN = 0.2;

const dot = (p: Point, q: Point) => p[0] * q[0] + p[1] * q[1];
const unit = (w: Wall): Point => {
  const L = length(w);
  return [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L];
};

/** 端点上相接的墙（L 角、被分割的宿主墙段、共线延续段）。 */
interface EndJoint { wall: Wall; end: 'a' | 'b' }
/** hosts：墙身穿过端点、只当滑轨的墙；ends：端点相接、随之伸缩的墙。 */
interface Joints { hosts: Wall[]; ends: EndJoint[] }

function jointsAt(d: Design, moving: Wall, p: Point): Joints {
  const hosts: Wall[] = [], ends: EndJoint[] = [];
  const u = unit(moving);
  for (const c of d.walls) {
    if (c.id === moving.id || d.demolished.includes(c.id) || length(c) < 1) continue;
    // 共线延续段不参与：它既不能当滑轨，也不能被拉歪。
    if (Math.abs(dot(unit(c), [-u[1], u[0]])) < MIN_ANGLE_SIN) continue;
    const tol = Math.max(moving.thickness, c.thickness) / 2 + 1;
    const end = (['a', 'b'] as const).find(k => Math.hypot(c[k][0] - p[0], c[k][1] - p[1]) <= tol);
    // 端点相接的可调整墙随之伸缩；不可调整的墙（如空白户型外框）只当滑轨。
    if (end && canResizeWall(d, c)) { ends.push({ wall: c, end }); continue; }
    const near = nearestOnWall(p, c);
    const gap = Math.hypot(near.point[0] - p[0], near.point[1] - p[1]);
    if (gap <= c.thickness / 2 + 1 && (end || (near.offset > 0 && near.offset < length(c)))) hosts.push(c);
  }
  return { hosts, ends };
}

/** 其他墙的端点落在被移动墙的墙身中段（T 形接入）。 */
function bodyJoints(d: Design, moving: Wall): EndJoint[] {
  const L = length(moving), joints: EndJoint[] = [];
  for (const c of d.walls) {
    if (c.id === moving.id || d.demolished.includes(c.id) || length(c) < 1 || !canResizeWall(d, c)) continue;
    const tol = Math.max(moving.thickness, c.thickness) / 2 + 1;
    for (const end of ['a', 'b'] as const) {
      const near = nearestOnWall(c[end], moving);
      const gap = Math.hypot(near.point[0] - c[end][0], near.point[1] - c[end][1]);
      if (gap <= moving.thickness / 2 + 1 && near.offset > tol && near.offset < L - tol) joints.push({ wall: c, end });
    }
  }
  return joints;
}

/** 端点的滑轨方向：优先取墙身穿过端点的宿主墙，其次取端点相接、与被移动墙不平行的墙。 */
function guideOf(j: Joints, n: Point): Point | undefined {
  for (const c of [...j.hosts, ...j.ends.map(e => e.wall)]) {
    const g = unit(c);
    if (Math.abs(dot(g, n)) >= MIN_ANGLE_SIN) return g;
  }
  return undefined;
}

/**
 * 整体移动一面墙。墙端连着其他墙时，端点沿连接墙滑动（墙只沿自身法向平移），
 * 端点相接的连接墙随之伸缩，接入墙身的墙同样沿自身方向滑到新墙线上，保持所有连接不断开。
 * 端点都没有导向墙时按 delta 自由平移。位移超出连接墙范围时被截断；无法满足时返回 null。
 */
export function moveWallWithJoints(d: Design, wallId: string, delta: Point): Design | null {
  const wall = d.walls.find(w => w.id === wallId);
  if (!wall || length(wall) < 1) return null;
  const L = length(wall), u = unit(wall), n: Point = [-u[1], u[0]];
  const ja = jointsAt(d, wall, wall.a), jb = jointsAt(d, wall, wall.b);
  const ga = guideOf(ja, n), gb = guideOf(jb, n);
  const body = bodyJoints(d, wall);
  // 每个端点的位移 = k · m（k 为沿法向的位移量）；无导向时 m = n。两端都无导向时按 delta 自由平移。
  const free = !ga && !gb;
  const rail = (g: Point | undefined): Point => g ? [g[0] / dot(g, n), g[1] / dot(g, n)] : n;
  const ma = rail(ga), mb = rail(gb);
  let k = dot(delta, n);
  if (!free) {
    // 约束形如 c0 + k·c1 ≥ 0，逐步收窄 k 的可行区间。
    let lo = -Infinity, hi = Infinity;
    const limit = (c0: number, c1: number) => {
      if (Math.abs(c1) < 1e-9) { if (c0 < -1e-6) lo = Infinity; return; }
      const bound = -c0 / c1;
      if (c1 > 0) lo = Math.max(lo, bound); else hi = Math.min(hi, bound);
    };
    for (const [j, p, m] of [[ja, wall.a, ma], [jb, wall.b, mb]] as const) {
      for (const c of j.hosts) {
        const g = unit(c);
        if (Math.abs(dot(g, n)) < MIN_ANGLE_SIN) continue;
        const q = nearestOnWall(p, c).offset, along = dot(m, g);
        limit(q, along); limit(length(c) - q, -along);
      }
      for (const { wall: c, end } of j.ends) {
        const other = end === 'a' ? c.b : c.a, Lc = length(c);
        const out: Point = [(c[end][0] - other[0]) / Lc, (c[end][1] - other[1]) / Lc];
        limit(Lc - MIN_LENGTH, dot(m, out));
      }
    }
    limit(L - MIN_LENGTH, dot([mb[0] - ma[0], mb[1] - ma[1]], u));
    if (lo > hi) return null;
    k = Math.min(hi, Math.max(lo, k));
  }
  const shiftA: Point = free ? delta : [ma[0] * k, ma[1] * k];
  const shiftB: Point = free ? delta : [mb[0] * k, mb[1] * k];
  const moved: Wall = { ...wall, a: [wall.a[0] + shiftA[0], wall.a[1] + shiftA[1]], b: [wall.b[0] + shiftB[0], wall.b[1] + shiftB[1]] };
  if (length(moved) < MIN_LENGTH) return null;

  const walls = new Map(d.walls.map(w => [w.id, w]));
  walls.set(wall.id, moved);
  const changed = new Set([wall.id]);
  const shiftEnd = ({ wall: c, end }: EndJoint, shift: Point) => {
    const current = walls.get(c.id)!;
    walls.set(c.id, { ...current, [end]: [current[end][0] + shift[0], current[end][1] + shift[1]] });
    changed.add(c.id);
  };
  ja.ends.forEach(j => shiftEnd(j, shiftA));
  jb.ends.forEach(j => shiftEnd(j, shiftB));
  for (const j of body) {
    const g = unit(j.wall), gn = dot(g, n);
    if (Math.abs(gn) < MIN_ANGLE_SIN) continue;
    const s = dot(shiftA, n) / gn;
    shiftEnd(j, [g[0] * s, g[1] * s]);
  }
  const nextWalls = d.walls.map(w => walls.get(w.id)!);
  if (nextWalls.some(w => changed.has(w.id) && length(w) < MIN_LENGTH)) return null;

  // 被带动伸缩的连接墙：门窗留在原位，不随移动的端点滑动。
  const next = keepOpeningsInPlace(d, { ...d, walls: nextWalls });
  return openingsFitWalls(next, changed) ? next : null;
}
