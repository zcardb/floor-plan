/**
 * 通用对齐辅助线：任何「轴对齐包围盒」（家具、整组、正在拖边的家具……）都用同一套吸附与辅助线规则。
 * - 对齐点：盒子的 起边 / 中线 / 止边（anchors）；
 * - 吸附：在容差内找最近的其他盒子对齐点；
 * - 辅助线：吸附后，凡与其他盒子对齐点重合的位置都画一条虚线，跨度覆盖所有参与对齐的盒子。
 */

/** 一条对齐虚线：`axis: 'x'` 是 x=`at` 的竖线，沿 y 从 `from` 画到 `to`；`axis: 'y'` 同理。 */
export interface AlignmentGuide { axis: 'x' | 'y'; at: number; from: number; to: number }
/** 轴对齐包围盒：中心 `c` 与半宽 / 半高 `h`。 */
export interface AlignBox { c: [number, number]; h: [number, number] }
/** 吸附候选：吸附后的值与距离。 */
export interface SnapCandidate { v: number; dist: number }
export type Axis = 0 | 1;

/** 视为重合的误差（mm）。 */
const EPS = 1;
export const anchors = (b: AlignBox, i: Axis) => [b.c[i] - b.h[i], b.c[i], b.c[i] + b.h[i]];

/** 由两个对边坐标构造包围盒（拖边时用）。 */
export const boxFromEdges = (x1: number, x2: number, y1: number, y2: number): AlignBox =>
  ({ c: [(x1 + x2) / 2, (y1 + y2) / 2], h: [Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2] });

/** 整体平移时：自身任一对齐点贴到其他盒子的任一对齐点，返回自身中心应到的位置。 */
export function snapBoxAxis(self: AlignBox, others: AlignBox[], i: Axis, center: number, tol: number): SnapCandidate | undefined {
  let best: SnapCandidate | undefined;
  for (const o of others)
    for (const target of anchors(o, i))
      for (const k of [-1, 0, 1]) {
        const v = target - k * self.h[i], dist = Math.abs(v - center);
        if (dist < (best?.dist ?? tol)) best = { v, dist };
      }
  return best;
}

/** 单个坐标（如被拖动的一条边）贴到其他盒子的对齐点。 */
export function snapCoordinate(value: number, others: AlignBox[], i: Axis, tol: number): SnapCandidate | undefined {
  let best: SnapCandidate | undefined;
  for (const o of others)
    for (const v of anchors(o, i)) {
      const dist = Math.abs(v - value);
      if (dist < (best?.dist ?? tol)) best = { v, dist };
    }
  return best;
}

/** 盒子在第 i 轴上与其他盒子重合的对齐线。 */
export function guidesFor(self: AlignBox, others: AlignBox[], i: Axis): AlignmentGuide[] {
  const j = i === 0 ? 1 : 0;
  return anchors(self, i).flatMap(at => {
    const hits = others.filter(o => anchors(o, i).some(a => Math.abs(a - at) <= EPS));
    if (!hits.length) return [];
    const all = [self, ...hits];
    return [{ axis: i === 0 ? 'x' : 'y', at, from: Math.min(...all.map(b => b.c[j] - b.h[j])), to: Math.max(...all.map(b => b.c[j] + b.h[j])) } as AlignmentGuide];
  });
}

export const sameGuides = (a: AlignmentGuide[], b: AlignmentGuide[]) =>
  a.length === b.length && a.every((g, i) => g.axis === b[i].axis && g.at === b[i].at && g.from === b[i].from && g.to === b[i].to);
