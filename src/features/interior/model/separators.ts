import polygonClipping from 'polygon-clipping';
import { inRing, length } from './geometry';
import { deriveRooms, enclosedRegions } from './roomDerive';
import { netArea } from './roomRegions';
import { connectedWallPoly } from './wallConnections';
import { uid, type Design, type Point, type Room, type Separator, type Wall } from './types';

/** 端点与墙面之间允许的贴合误差（mm）。 */
const TOUCH = 2;
/** 分隔线与墙面的夹角正弦低于该值视为平行，不能沿分隔线方向滑到墙面上。 */
const MIN_SINE = 0.1;
/** 迁移时，相邻两房间平行对边之间超出墙厚的容差（mm）。 */
const GAP_SLACK = 60;
/** 短于该长度（mm）的分隔线丢弃。 */
const MIN_LENGTH = 20;

const sub = (p: Point, q: Point): Point => [p[0] - q[0], p[1] - q[1]];
const add = (p: Point, v: Point, k = 1): Point => [p[0] + v[0] * k, p[1] + v[1] * k];
const dot = (p: Point, q: Point) => p[0] * q[0] + p[1] * q[1];
const cross = (p: Point, q: Point) => p[0] * q[1] - p[1] * q[0];
const unit = (v: Point): Point | undefined => {
  const n = Math.hypot(v[0], v[1]);
  return n > 1e-9 ? [v[0] / n, v[1] / n] : undefined;
};
const sameWall = (a: Wall, b: Wall) =>
  a.a[0] === b.a[0] && a.a[1] === b.a[1] && a.b[0] === b.b[0] && a.b[1] === b.b[1] && a.thickness === b.thickness;
export const separatorLength = (s: Separator) => Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);

/** 端点贴着的墙面：侧面（沿墙、带法向偏移 s）或端头（墙起点 / 终点处的横截线）。 */
type Face = { wall: string; kind: 'side'; offset: number } | { wall: string; kind: 'cap'; end: 'a' | 'b' };

function frame(w: Wall) {
  const L = length(w), dir = unit(sub(w.b, w.a));
  return dir ? { L, dir, normal: [-dir[1], dir[0]] as Point } : undefined;
}

/** 端点贴着的墙面中，与分隔线夹角最大的那一面（夹角太小无法沿分隔线滑动）。 */
function attachedFace(p: Point, direction: Point, walls: Wall[]): Face | undefined {
  let best: { face: Face; sine: number } | undefined;
  for (const w of walls) {
    const f = frame(w);
    if (!f) continue;
    const local = sub(p, w.a), t = dot(local, f.dir), s = dot(local, f.normal), half = w.thickness / 2;
    if (Math.abs(s) > half + TOUCH || t < -TOUCH || t > f.L + TOUCH) continue;
    const consider = (face: Face, sine: number) => { if (sine >= MIN_SINE && (!best || sine > best.sine)) best = { face, sine }; };
    const sideOffset = Math.abs(Math.abs(s) - half) <= TOUCH ? Math.sign(s) * half : s;
    consider({ wall: w.id, kind: 'side', offset: sideOffset }, Math.abs(cross(direction, f.dir)));
    if (Math.abs(t) <= TOUCH) consider({ wall: w.id, kind: 'cap', end: 'a' }, Math.abs(dot(direction, f.dir)));
    if (Math.abs(t - f.L) <= TOUCH) consider({ wall: w.id, kind: 'cap', end: 'b' }, Math.abs(dot(direction, f.dir)));
  }
  return best?.face;
}

/** 墙面在移动后的墙上的位置：返回直线上一点与方向。 */
function faceLine(face: Face, before: Wall, after: Wall): { origin: Point; dir: Point } | undefined {
  const f = frame(after);
  if (!f) return undefined;
  if (face.kind === 'cap') return { origin: face.end === 'a' ? after.a : after.b, dir: f.normal };
  const half = before.thickness / 2, onFace = Math.abs(Math.abs(face.offset) - half) < 1e-6;
  const offset = onFace ? Math.sign(face.offset) * (after.thickness / 2) : face.offset;
  return { origin: add(after.a, f.normal, offset), dir: f.dir };
}

function slide(p: Point, direction: Point, line: { origin: Point; dir: Point }): Point | undefined {
  const denominator = cross(direction, line.dir);
  if (Math.abs(denominator) < 1e-9) return undefined;
  return add(p, direction, cross(sub(line.origin, p), line.dir) / denominator);
}

/**
 * 墙体移动 / 改厚后让分隔线跟随：端点原本贴着某面墙的，沿分隔线方向伸缩到移动后的同一墙面上。
 * 墙被删除或没动时端点保持不动。
 */
export function followSeparators(before: Design, after: Design): Design {
  const separators = after.separators;
  if (!separators?.length) return after;
  const moved = new Map<string, { before: Wall; after: Wall }>();
  for (const wall of after.walls) {
    const old = before.walls.find(w => w.id === wall.id);
    if (old && !sameWall(old, wall)) moved.set(wall.id, { before: old, after: wall });
  }
  if (!moved.size) return after;
  const standing = before.walls.filter(w => !before.demolished.includes(w.id));
  let changed = false;
  const next = separators.map(s => {
    const direction = unit(sub(s.b, s.a));
    if (!direction) return s;
    const ends = (['a', 'b'] as const).map(end => {
      const face = attachedFace(s[end], direction, standing);
      const pair = face && moved.get(face.wall);
      const line = face && pair && faceLine(face, pair.before, pair.after);
      return (line && slide(s[end], direction, line)) ?? s[end];
    });
    if (ends[0] === s.a && ends[1] === s.b) return s;
    changed = true;
    return { ...s, a: ends[0]!, b: ends[1]! };
  });
  return changed ? { ...after, separators: next } : after;
}

/** 加一条分隔线并重算房间。 */
export function addSeparator(d: Design, a: Point, b: Point): { design: Design; id: string } {
  if (Math.hypot(b[0] - a[0], b[1] - a[1]) < MIN_LENGTH) throw new Error('分隔线太短');
  const id = uid();
  return { design: deriveRooms({ ...d, separators: [...(d.separators ?? []), { id, a, b }] }), id };
}

/** 删除分隔线并重算房间（被它分开的两间房并回一间）。 */
export function removeSeparator(d: Design, id: string): Design {
  if (!d.separators?.some(s => s.id === id)) throw new Error('分隔线不存在，请重新选择');
  return deriveRooms({ ...d, separators: d.separators.filter(s => s.id !== id) });
}

// ---- 旧数据迁移 ----

function signedArea(ring: Point[]) {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!, q = ring[(i + 1) % ring.length]!;
    sum += p[0] * q[1] - q[0] * p[1];
  }
  return sum / 2;
}

interface Edge { a: Point; dir: Point; out: Point; L: number }
function edgesOf(room: Room): Edge[] {
  const ring = room.rings[0] ?? [];
  const ccw = signedArea(ring) > 0;
  const edges: Edge[] = [];
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length]!, dir = unit(sub(b, a));
    if (!dir) return;
    edges.push({ a, dir, out: ccw ? [dir[1], -dir[0]] : [-dir[1], dir[0]], L: Math.hypot(b[0] - a[0], b[1] - a[1]) });
  });
  return edges;
}

/** 两间房相对的平行边之间（缝宽 ≤ 墙厚 + 60 mm、沿边方向有重叠）的中线段。 */
function midlines(r1: Room, r2: Room, maxGap: number): [Point, Point][] {
  const lines: [Point, Point][] = [];
  for (const e of edgesOf(r1))
    for (const f of edgesOf(r2)) {
      if (dot(e.out, f.out) > -0.999) continue;
      const gap = dot(sub(f.a, e.a), e.out);
      if (gap < -TOUCH || gap > maxGap) continue;
      const t1 = dot(sub(f.a, e.a), e.dir), t2 = t1 + dot(f.dir, e.dir) * f.L;
      const from = Math.max(0, Math.min(t1, t2)), to = Math.min(e.L, Math.max(t1, t2));
      if (to - from < MIN_LENGTH) continue;
      const base = add(e.a, e.out, gap / 2);
      lines.push([add(base, e.dir, from), add(base, e.dir, to)]);
    }
  return lines;
}

/** 线段减去墙体覆盖的部分：贴着墙面走（偏 1 mm 落进墙里）的也算被覆盖。 */
function uncovered([a, b]: [Point, Point], walls: Point[][]): [Point, Point][] {
  const dir = sub(b, a), L = Math.hypot(dir[0], dir[1]);
  const u: Point = [dir[0] / L, dir[1] / L], n: Point = [-u[1], u[0]];
  const cuts = new Set([0, 1]);
  for (const poly of walls)
    poly.forEach((p, i) => {
      const q = poly[(i + 1) % poly.length]!, e = sub(q, p), denominator = cross(dir, e);
      if (Math.abs(denominator) < 1e-9) {
        for (const v of [p, q]) { const t = dot(sub(v, a), dir) / (L * L); if (t > 0 && t < 1) cuts.add(t); }
        return;
      }
      const t = cross(sub(p, a), e) / denominator, s = cross(sub(p, a), dir) / denominator;
      if (t > 0 && t < 1 && s >= 0 && s <= 1) cuts.add(t);
    });
  const ts = [...cuts].sort((x, y) => x - y);
  const covered = (p: Point) => walls.some(poly => inRing(add(p, n, 1), poly) || inRing(add(p, n, -1), poly) || inRing(p, poly));
  const pieces: [Point, Point][] = [];
  for (let i = 0; i < ts.length - 1; i++) {
    const from = add(a, dir, ts[i]!), to = add(a, dir, ts[i + 1]!);
    if (covered(add(a, dir, (ts[i]! + ts[i + 1]!) / 2))) continue;
    const last = pieces[pieces.length - 1];
    if (last && last[1][0] === from[0] && last[1][1] === from[1]) last[1] = to;
    else pieces.push([from, to]);
  }
  return pieces.filter(([p, q]) => Math.hypot(q[0] - p[0], q[1] - p[1]) >= MIN_LENGTH);
}

const roundPoint = ([x, y]: Point): Point => [Math.round(x * 10) / 10, Math.round(y * 10) / 10];

function overlap(a: Point[][], b: Point[][]) {
  try {
    return polygonClipping.intersection(a, b).reduce((s, p) => s + netArea(p.map(r => r.slice(0, -1) as Point[])), 0);
  } catch {
    return 0;
  }
}

/**
 * 旧项目（没有 separators 字段）迁移：先只按墙算区域，一个区域里有两间以上旧房间时，
 * 在相邻房间平行对边的中线处补分隔线（墙已覆盖的部分扣掉），再按旧房间沿用名称与材质重算房间。
 */
export function migrateSeparators(d: Design): Design {
  if (d.separators) return d;
  const bare: Design = { ...d, separators: [] };
  if (!d.walls.length) return bare;
  const regions = enclosedRegions(bare);
  const rooms = d.rooms.filter(r => r.rings[0] && r.rings[0].length >= 3);
  const groups = regions.map(region => rooms.filter(r => overlap(region, r.rings) >= 0.5 * netArea(r.rings)));
  const maxGap = Math.max(d.thickness, ...d.walls.map(w => w.thickness)) + GAP_SLACK;
  const walls = d.walls.filter(w => !d.demolished.includes(w.id) && w.kind !== 'low' && length(w) > 0.01)
    .map(w => connectedWallPoly(w, d.walls, d.demolished));
  const separators: Separator[] = [];
  for (const group of groups)
    for (let i = 0; i < group.length; i++)
      for (let j = i + 1; j < group.length; j++)
        for (const line of midlines(group[i]!, group[j]!, maxGap))
          for (const [a, b] of uncovered(line, walls))
            // 迁移结果要可复现（同一模板每次生成都一样），id 按序号编排。
            separators.push({ id: `separator-${separators.length + 1}`, a: roundPoint(a), b: roundPoint(b) });
  return deriveRooms({ ...bare, separators }, d.rooms);
}
