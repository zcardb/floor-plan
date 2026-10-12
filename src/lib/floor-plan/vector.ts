import type { Point } from './types';

/** 平面向量运算：点与向量都用 [x, y]（mm）。 */
export const sub = (p: Point, q: Point): Point => [p[0] - q[0], p[1] - q[1]];
export const add = (p: Point, v: Point, k = 1): Point => [p[0] + v[0] * k, p[1] + v[1] * k];
export const dot = (p: Point, q: Point) => p[0] * q[0] + p[1] * q[1];
export const cross = (p: Point, q: Point) => p[0] * q[1] - p[1] * q[0];
export const distance = (p: Point, q: Point) => Math.hypot(p[0] - q[0], p[1] - q[1]);
/** 单位向量；零向量返回 undefined。 */
export const unit = (v: Point): Point | undefined => {
  const n = Math.hypot(v[0], v[1]);
  return n > 1e-9 ? [v[0] / n, v[1] / n] : undefined;
};
