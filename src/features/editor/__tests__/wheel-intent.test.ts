import { describe, expect, it } from 'vitest';
import { createWheelIntent, looksLikeMouseWheel } from '../model/wheel-intent';

const sample = (deltaX: number, deltaY: number, timeStamp: number, extra: Partial<{ deltaMode: number; ctrlKey: boolean }> = {}) =>
  ({ deltaX, deltaY, deltaMode: 0, ctrlKey: false, timeStamp, ...extra });

describe('画布滚轮意图', () => {
  it('鼠标滚轮（整数大步长或按行滚动）缩放', () => {
    expect(looksLikeMouseWheel(sample(0, 100, 0))).toBe(true);
    expect(looksLikeMouseWheel(sample(0, 3, 0, { deltaMode: 1 }))).toBe(true);
    expect(createWheelIntent()(sample(0, -120, 0))).toBe('zoom');
  });
  it('触控板双指滑动（小增量、带小数或横向分量）只平移', () => {
    expect(createWheelIntent()(sample(0, 4.5, 0))).toBe('pan');
    expect(createWheelIntent()(sample(12, 0, 0))).toBe('pan');
    expect(createWheelIntent()(sample(3, 60, 0))).toBe('pan');
  });
  it('双指捏合（ctrl + wheel）一律缩放', () => {
    expect(createWheelIntent()(sample(0, 2.3, 0, { ctrlKey: true }))).toBe('zoom');
  });
  it('同一串连续滚动沿用首次判断，间隔够久才重新判断', () => {
    const intent = createWheelIntent();
    expect(intent(sample(0, 6, 0))).toBe('pan');
    // 惯性滚动里偶尔出现整数大步长，不应中途切成缩放。
    expect(intent(sample(0, 100, 50))).toBe('pan');
    expect(intent(sample(0, 100, 600))).toBe('zoom');
  });
});
