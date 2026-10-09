import type { Design } from './types';

/** 拖动门窗时沿墙移动的默认步进（mm）。 */
export const DEFAULT_DRAG_STEP = 50;
export const DRAG_STEP_OPTIONS = [10, 50, 100] as const;

/** 门窗拖动步进（mm）；旧项目没有该字段，按 5 cm 处理。 */
export function dragStep(d: Pick<Design, 'dragStep'>): number {
  return d.dragStep ?? DEFAULT_DRAG_STEP;
}

export function changeDragStep(d: Design, mm: number): Design {
  if (typeof mm !== 'number' || !Number.isFinite(mm) || mm < 1 || mm > 1000) throw new Error('拖动步进须在 0.1–100 cm 之间');
  return { ...d, dragStep: Math.round(mm) };
}

/** 按步进取整沿墙位置（自 A 端量起）。 */
export const snapToDragStep = (value: number, step: number) => Math.round(value / step) * step;
