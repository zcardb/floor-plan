import { snapToDragStep } from './dragStep';
import type { Design, Point } from './types';

/** 端点 / 平移吸附距离（屏幕像素），与绘墙吸附一致。 */
const SNAP_PX = 12;
const MIN_LENGTH = 20;
const PARALLEL = 1e-3;

const sub = (p: Point, q: Point): Point => [p[0] - q[0], p[1] - q[1]];
const dot = (p: Point, q: Point) => p[0] * q[0] + p[1] * q[1];
const unitOf = (v: Point): Point | undefined => {
  const n = Math.hypot(v[0], v[1]);
  return n > 1e-9 ? [v[0] / n, v[1] / n] : undefined;
};

/**
 * 沿 axis 方向能停靠的墙体位置（相对 origin）：与 axis 垂直的墙给出两侧墙面与中线，
 * 与 axis 平行的墙给出两个墙端截面（即「墙的左端 / 右端」）。
 * 只收在 side 方向上与 span 区间有交叠的墙，避免吸到远处不相干的墙。
 */
function wallStops(d: Design, origin: Point, axis: Point, span: [number, number]): number[] {
  const side: Point = [-axis[1], axis[0]], stops: number[] = [];
  const at = (p: Point) => dot(sub(p, origin), axis), across = (p: Point) => dot(sub(p, origin), side);
  const overlaps = (lo: number, hi: number) => Math.min(hi, span[1]) >= Math.max(lo, span[0]) - 2;
  for (const w of d.walls) {
    if (d.demolished.includes(w.id) || w.kind === 'low') continue;
    const dir = unitOf(sub(w.b, w.a));
    if (!dir) continue;
    const half = w.thickness / 2;
    if (Math.abs(dot(dir, axis)) < PARALLEL) {
      const s1 = across(w.a), s2 = across(w.b);
      if (overlaps(Math.min(s1, s2) - half, Math.max(s1, s2) + half)) stops.push(at(w.a) - half, at(w.a), at(w.a) + half);
    } else if (Math.abs(dot(dir, side)) < PARALLEL) {
      const s = across(w.a);
      if (overlaps(s - half, s + half)) stops.push(at(w.a), at(w.b));
    }
  }
  return stops;
}

/** 吸附：容差内最近的停靠位置；没有时按拖动步进取整相对 base 的位移。 */
function settle(value: number, base: number, stops: number[], tolerance: number, step: number) {
  let best: number | undefined;
  for (const s of stops) if (Math.abs(s - value) <= tolerance && (best === undefined || Math.abs(s - value) < Math.abs(best - value))) best = s;
  return best ?? base + snapToDragStep(value - base, step);
}

/**
 * 拖动分隔线一端时的落点：始终留在分隔线自身方向上（只改长度），
 * 吸附到途经墙体的墙面、中线与墙端截面；太短（含拖过另一端）返回 undefined。
 */
export function separatorEndTarget(d: Design, id: string, end: 'a' | 'b', raw: Point, scale: number, snap: boolean, step: number): Point | undefined {
  const s = d.separators?.find(l => l.id === id);
  if (!s) return undefined;
  const other = end === 'a' ? s.b : s.a, axis = unitOf(sub(s[end], other));
  if (!axis) return undefined;
  const current = dot(sub(s[end], other), axis), value = dot(sub(raw, other), axis);
  const stops = snap ? wallStops(d, other, axis, [0, 0]) : [];
  const t = settle(value, current, stops, SNAP_PX / scale, step);
  return t < MIN_LENGTH ? undefined : [other[0] + axis[0] * t + 0, other[1] + axis[1] * t + 0];
}

/** 整条分隔线平移的位移：只取法向分量，吸附到平行墙体的墙面 / 中线，或与之垂直的墙端截面。 */
export function separatorShift(d: Design, id: string, delta: Point, scale: number, snap: boolean, step: number): Point {
  const s = d.separators?.find(l => l.id === id);
  const u = s && unitOf(sub(s.b, s.a));
  if (!s || !u) return [0, 0];
  const n: Point = [-u[1], u[0]], L = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
  // wallStops 的 side 轴是 [-n[1], n[0]] = -u：分隔线在 side 方向上的区间是 [-L, 0]。
  const stops = snap ? wallStops(d, s.a, n, [-L, 0]) : [];
  const k = settle(dot(delta, n), 0, stops, SNAP_PX / scale, step);
  // + 0 把 -0 归一成 0，坐标保持干净。
  return [n[0] * k + 0, n[1] * k + 0];
}
