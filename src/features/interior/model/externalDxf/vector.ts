import type { Point } from '../types';

/** 识别算法用到的二维向量与区间小工具。 */
export type Interval = [number, number];
export const sub = (p: Point, q: Point): Point => [p[0] - q[0], p[1] - q[1]];
export const add = (p: Point, v: Point, k = 1): Point => [p[0] + v[0] * k, p[1] + v[1] * k];
export const dot = (p: Point, q: Point) => p[0] * q[0] + p[1] * q[1];
export const cross = (p: Point, q: Point) => p[0] * q[1] - p[1] * q[0];
export const distance = (p: Point, q: Point) => Math.hypot(p[0] - q[0], p[1] - q[1]);
export const midpoint = (p: Point, q: Point): Point => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
export const unit = (p: Point, q: Point): Point => {
  const L = distance(p, q);
  return [(q[0] - p[0]) / L, (q[1] - p[1]) / L];
};
/** 无向直线的统一方向：x 分量非负（竖直线朝 +y），保证平行线投影到同一坐标轴。 */
export const canonicalDirection = (p: Point, q: Point): Point => {
  const u = unit(p, q);
  return u[0] < -1e-9 || (Math.abs(u[0]) <= 1e-9 && u[1] < 0) ? [-u[0], -u[1]] : u;
};
export const normalOf = (u: Point): Point => [-u[1], u[0]];
/** 轴坐标系 (u, n) 中 t 处、法向偏移 c 的点。 */
export const onAxis = (u: Point, n: Point, t: number, c: number): Point => [u[0] * t + n[0] * c, u[1] * t + n[1] * c];
export const projectRange = (p: Point, q: Point, u: Point): Interval => {
  const s = dot(p, u), e = dot(q, u);
  return s < e ? [s, e] : [e, s];
};

export function subtractIntervals(range: Interval, cuts: Interval[]): Interval[] {
  let out: Interval[] = [range];
  for (const [s, e] of cuts)
    out = out.flatMap(([a, b]): Interval[] => {
      if (e <= a || s >= b) return [[a, b]];
      return ([[a, Math.min(b, s)], [Math.max(a, e), b]] as Interval[]).filter(([x, y]) => y - x > 1e-6);
    });
  return out;
}
export function intersectIntervals(p: Interval[], q: Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const [a, b] of p)
    for (const [c, d] of q) {
      const s = Math.max(a, c), e = Math.min(b, d);
      if (e > s) out.push([s, e]);
    }
  return out;
}
/** 合并重叠或间距不超过 gap 的区间。 */
export function mergeIntervals(list: Interval[], gap: number): Interval[] {
  const sorted = list.slice().sort((x, y) => x[0] - y[0]), out: Interval[] = [];
  for (const [s, e] of sorted) {
    const last = out[out.length - 1];
    if (last && s <= last[1] + gap) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

/** 共线分组：方向差 < 1°、法向偏移 < offsetTolerance、厚度差 ≤ 20 的线段归为同一条轴线。 */
export interface AxisGroup { u: Point; n: Point; c: number; thickness: number; runs: Interval[] }
export function groupCollinear(items: { a: Point; b: Point; thickness: number }[], offsetTolerance: number, gap: number): AxisGroup[] {
  const groups: AxisGroup[] = [];
  const buckets = new Map<string, AxisGroup[]>();
  for (const item of items) {
    const u = canonicalDirection(item.a, item.b), n = normalOf(u), c = dot(midpoint(item.a, item.b), n);
    const key = Math.round((Math.atan2(u[1], u[0]) * 180) / Math.PI) + ':' + item.thickness;
    const near = [-1, 0, 1].flatMap(d => {
      const angle = Math.round((Math.atan2(u[1], u[0]) * 180) / Math.PI) + d;
      return [buckets.get(angle + ':' + item.thickness) ?? [], buckets.get(-angle + ':' + item.thickness) ?? []];
    }).flat();
    let group = near.find(g => Math.abs(cross(u, g.u)) < 0.0175 && Math.abs(dot(midpoint(item.a, item.b), g.n) - g.c) < offsetTolerance);
    if (!group) {
      group = { u, n, c, thickness: item.thickness, runs: [] };
      groups.push(group);
      buckets.set(key, [...(buckets.get(key) ?? []), group]);
    }
    group.runs.push(projectRange(item.a, item.b, group.u));
  }
  for (const group of groups) group.runs = mergeIntervals(group.runs, gap);
  return groups;
}
