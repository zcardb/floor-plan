import type { Design, Point } from '@/lib/floor-plan/types';

/** 画布拖动（墙、墙端点、家具、门窗）的默认步进（mm）。 */
export const DEFAULT_DRAG_STEP = 50;
export const DRAG_STEP_OPTIONS = [10, 50, 100] as const;

/** 拖动步进（mm）；旧项目没有该字段，按 5 cm 处理。 */
export function dragStep(d: Pick<Design, 'dragStep'>): number {
  return d.dragStep ?? DEFAULT_DRAG_STEP;
}

export function changeDragStep(d: Design, mm: number): Design {
  if (typeof mm !== 'number' || !Number.isFinite(mm) || mm < 1 || mm > 1000) throw new Error('拖动步进须在 0.1–100 cm 之间');
  return { ...d, dragStep: Math.round(mm) };
}

/** 按步进取整一个长度或坐标值。 */
export const snapToDragStep = (value: number, step: number) => Math.round(value / step) * step;

/**
 * 按步进取整一次拖动位移。给出 axis（单位向量，如墙的方向）时，沿 axis 与其法向分别取整，
 * 斜墙也能按「沿墙 / 垂直墙」整步移动；否则按图纸 x / y 取整。
 */
export function stepDelta(delta: Point, step: number, axis?: Point): Point {
  if (!axis) return [snapToDragStep(delta[0], step), snapToDragStep(delta[1], step)];
  const n: Point = [-axis[1], axis[0]];
  const t = snapToDragStep(delta[0] * axis[0] + delta[1] * axis[1], step);
  const k = snapToDragStep(delta[0] * n[0] + delta[1] * n[1], step);
  return [axis[0] * t + n[0] * k, axis[1] * t + n[1] * k];
}
