/** 一次滚轮事件里判断意图所需的字段（与 WheelEvent 同名）。 */
export interface WheelSample {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
  metaKey?: boolean;
  timeStamp: number;
}
export type WheelIntent = 'zoom' | 'pan';
export type WheelSource = 'mouse' | 'trackpad';

/** 同一串连续滚动之间的最大间隔（ms）：间隔内沿用第一次的来源判断。 */
const STREAK_GAP = 220;

/**
 * 单个事件看起来像鼠标滚轮吗：按行 / 页滚动，或者只有纵向、整数、步长较大（常见 100 / 120）。
 * 触控板双指滑动通常带横向分量或是小幅、带小数的增量。
 */
export function looksLikeMouseWheel(e: WheelSample): boolean {
  if (e.deltaMode !== 0) return true;
  return e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 50;
}

/**
 * 画布滚轮意图：触控板双指捏合（浏览器报为 ctrl + wheel）与鼠标滚轮 = 缩放；触控板双指滑动 = 平移。
 * 来源在一串连续滚动里只判断一次，避免惯性滚动中途在缩放 / 平移之间来回跳。
 */
export function createWheelIntent() {
  let source: WheelSource | null = null, last = -Infinity;
  return (e: WheelSample): WheelIntent => {
    if (e.ctrlKey || e.metaKey) { last = e.timeStamp; return 'zoom'; }
    if (!source || e.timeStamp - last > STREAK_GAP) source = looksLikeMouseWheel(e) ? 'mouse' : 'trackpad';
    last = e.timeStamp;
    return source === 'mouse' ? 'zoom' : 'pan';
  };
}
