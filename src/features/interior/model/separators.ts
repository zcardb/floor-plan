import { length } from './geometry';
import { MIN_SEPARATOR_LENGTH, SEPARATOR_TOUCH, deriveRooms } from './roomDerive';
import { uid, type Design, type Point, type Separator, type Wall } from './types';
import { add, cross, dot, sub, unit } from './vector';

/** 分隔线与墙面的夹角正弦低于该值视为平行，不能沿分隔线方向滑到墙面上。 */
const MIN_SINE = 0.1;

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
    if (Math.abs(s) > half + SEPARATOR_TOUCH || t < -SEPARATOR_TOUCH || t > f.L + SEPARATOR_TOUCH) continue;
    const consider = (face: Face, sine: number) => { if (sine >= MIN_SINE && (!best || sine > best.sine)) best = { face, sine }; };
    const sideOffset = Math.abs(Math.abs(s) - half) <= SEPARATOR_TOUCH ? Math.sign(s) * half : s;
    consider({ wall: w.id, kind: 'side', offset: sideOffset }, Math.abs(cross(direction, f.dir)));
    if (Math.abs(t) <= SEPARATOR_TOUCH) consider({ wall: w.id, kind: 'cap', end: 'a' }, Math.abs(dot(direction, f.dir)));
    if (Math.abs(t - f.L) <= SEPARATOR_TOUCH) consider({ wall: w.id, kind: 'cap', end: 'b' }, Math.abs(dot(direction, f.dir)));
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
  if (Math.hypot(b[0] - a[0], b[1] - a[1]) < MIN_SEPARATOR_LENGTH) throw new Error('分隔线太短');
  const id = uid();
  return { design: deriveRooms({ ...d, separators: [...(d.separators ?? []), { id, a, b }] }), id };
}

/** 与另一条分隔线共线且沿方向重叠超过 1 mm。 */
function overlapsOther(lines: Separator[], self: Separator) {
  const u = unit(sub(self.b, self.a));
  if (!u) return false;
  const L = separatorLength(self);
  return lines.some(o => {
    if (o.id === self.id) return false;
    if (Math.abs(cross(sub(o.a, self.a), u)) > 0.5 || Math.abs(cross(sub(o.b, self.a), u)) > 0.5) return false;
    const t1 = dot(sub(o.a, self.a), u), t2 = dot(sub(o.b, self.a), u);
    return Math.min(L, Math.max(t1, t2)) - Math.max(0, Math.min(t1, t2)) > 1;
  });
}

/** 把分隔线放到新位置并重算房间；位置没变时返回原对象。 */
function placeSeparator(d: Design, id: string, a: Point, b: Point): Design {
  const old = d.separators?.find(s => s.id === id);
  if (!old) throw new Error('分隔线不存在，请重新选择');
  if (old.a[0] === a[0] && old.a[1] === a[1] && old.b[0] === b[0] && old.b[1] === b[1]) return d;
  const next = { ...old, a, b };
  if (separatorLength(next) < MIN_SEPARATOR_LENGTH) throw new Error('分隔线太短');
  const separators = d.separators!.map(s => (s.id === id ? next : s));
  if (overlapsOther(separators, next)) throw new Error('分隔线不能重叠');
  return deriveRooms({ ...d, separators }, d.rooms);
}

const findSeparator = (d: Design, id: string) => {
  const s = d.separators?.find(l => l.id === id);
  if (!s) throw new Error('分隔线不存在，请重新选择');
  return s;
};

/** 拖动一端到新位置。 */
export function moveSeparatorEnd(d: Design, id: string, end: 'a' | 'b', to: Point): Design {
  const s = findSeparator(d, id);
  return end === 'a' ? placeSeparator(d, id, to, s.b) : placeSeparator(d, id, s.a, to);
}

/** 整条线平移：只取沿自身法向的分量（拖动端点留在原来那面墙上）。 */
export function moveSeparatorBy(d: Design, id: string, delta: Point): Design {
  const s = findSeparator(d, id), u = unit(sub(s.b, s.a));
  if (!u) return d;
  const n: Point = [-u[1], u[0]], k = dot(delta, n);
  return placeSeparator(d, id, add(s.a, n, k), add(s.b, n, k));
}

/** 以 anchor 那一端为基准改长度，另一端沿原方向伸缩。 */
export function resizeSeparator(d: Design, id: string, length: number, anchor: 'a' | 'b'): Design {
  if (!Number.isFinite(length)) throw new Error('长度无效');
  const s = findSeparator(d, id), u = unit(sub(s.b, s.a));
  if (!u) throw new Error('分隔线太短');
  return anchor === 'a' ? placeSeparator(d, id, s.a, add(s.a, u, length)) : placeSeparator(d, id, add(s.b, u, -length), s.b);
}

/** 端点是否贴在墙面或另一条分隔线上（用于默认固定端）。 */
export function separatorEndAttached(d: Design, s: Separator, end: 'a' | 'b') {
  const p = s[end], direction = unit(sub(s.b, s.a));
  if (!direction) return false;
  const standing = d.walls.filter(w => !d.demolished.includes(w.id) && w.kind !== 'low');
  if (attachedFace(p, direction, standing)) return true;
  return (d.separators ?? []).some(o => {
    if (o.id === s.id) return false;
    const v = sub(o.b, o.a), L2 = dot(v, v);
    const t = L2 ? Math.max(0, Math.min(1, dot(sub(p, o.a), v) / L2)) : 0;
    return Math.hypot(...sub(p, add(o.a, v, t))) <= SEPARATOR_TOUCH;
  });
}

/** 删除分隔线并重算房间（被它分开的两间房并回一间）。 */
export function removeSeparator(d: Design, id: string): Design {
  if (!d.separators?.some(s => s.id === id)) throw new Error('分隔线不存在，请重新选择');
  return deriveRooms({ ...d, separators: d.separators.filter(s => s.id !== id) });
}
