import type { Point } from '@/lib/floor-plan/types';
import { cross, distance, dot } from '@/lib/floor-plan/vector';

/** 识别算法用到的方向、区间与共线分组小工具（基础向量运算见 model/vector）。 */
export type Interval = [number, number];
export const midpoint = (p: Point, q: Point): Point => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
export const normalOf = (u: Point): Point => [-u[1], u[0]];
/** 无向直线的统一方向：x 分量非负（竖直线朝 +y）。 */
export function canonicalDirection(p: Point, q: Point): Point {
  const L = distance(p, q), u: Point = [(q[0] - p[0]) / L, (q[1] - p[1]) / L];
  return u[0] < -1e-9 || (Math.abs(u[0]) <= 1e-9 && u[1] < 0) ? [-u[0], -u[1]] : u;
}
export const wrapBucket = (deg: number) => (deg <= -90 ? deg + 180 : deg > 90 ? deg - 180 : deg);
/** 方向所在的整数角度桶，范围 (-90, 90]。 */
export const angleBucket = (u: Point) => wrapBucket(Math.round((Math.atan2(u[1], u[0]) * 180) / Math.PI));
export const bucketNormal = (deg: number): Point => [-Math.sin((deg * Math.PI) / 180), Math.cos((deg * Math.PI) / 180)];
/** 点集的包围盒（循环实现，大图纸上不会撑爆参数栈）。 */
export function boundsOf(points: Iterable<Point>) {
  let x = Infinity, y = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const p of points) { x = Math.min(x, p[0]); y = Math.min(y, p[1]); x2 = Math.max(x2, p[0]); y2 = Math.max(y2, p[1]); }
  return { x, y, x2, y2 };
}
/** 轴坐标系 (u, n) 中沿轴 t、法向 c 处的点。 */
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
  const sorted = list.map(r => [...r] as Interval).sort((x, y) => x[0] - y[0]), out: Interval[] = [];
  for (const [s, e] of sorted) {
    const last = out[out.length - 1];
    if (last && s <= last[1] + gap) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

/**
 * 共线分组：方向差 < 1°、法向偏移 < tolerance、厚度相同的线段归为一条轴线，区间按 gap 合并。
 * 用「角度桶 × 法向偏移桶」索引，避免大图纸上的两两比较。
 */
export interface AxisGroup { u: Point; n: Point; c: number; thickness: number; runs: Interval[] }
export function groupCollinear(items: { a: Point; b: Point; thickness: number }[], tolerance: number, gap: (g: AxisGroup) => number): AxisGroup[] {
  const groups: AxisGroup[] = [], index = new Map<string, AxisGroup[]>();
  const size = Math.max(50, tolerance * 4);
  const keyOf = (deg: number, middle: Point, thickness: number, shift = 0) =>
    `${deg}|${Math.floor(dot(middle, bucketNormal(deg)) / size) + shift}|${thickness}`;
  for (const item of items) {
    const u = canonicalDirection(item.a, item.b), middle = midpoint(item.a, item.b), deg = angleBucket(u);
    let group: AxisGroup | undefined;
    search: for (const d of [0, -1, 1])
      for (const shift of [0, -1, 1])
        for (const g of index.get(keyOf(wrapBucket(deg + d), middle, item.thickness, shift)) ?? [])
          if (Math.abs(cross(u, g.u)) < 0.0175 && Math.abs(dot(middle, g.n) - g.c) < tolerance) { group = g; break search; }
    if (!group) {
      const n = normalOf(u);
      group = { u, n, c: dot(middle, n), thickness: item.thickness, runs: [] };
      groups.push(group);
      const key = keyOf(deg, middle, item.thickness);
      index.set(key, [...(index.get(key) ?? []), group]);
    }
    group.runs.push(projectRange(item.a, item.b, group.u));
  }
  for (const group of groups) group.runs = mergeIntervals(group.runs, gap(group));
  return groups;
}
