import { expect, it } from 'vitest';
import { isCompletionClick, supportsPointerCompletion } from './toolCompletion';

it('仅绘墙测量允许双击或右键完成，首下单击和其他工具不受影响', () => {
  for (const tool of ['wall', 'measure'] as const) {
    expect(supportsPointerCompletion(tool)).toBe(true);
    expect(isCompletionClick(tool, 0, 1)).toBe(false);
    expect(isCompletionClick(tool, 0, 2)).toBe(true);
    expect(isCompletionClick(tool, 2, 2)).toBe(false);
  }
  for (const tool of ['select', 'door', 'window', 'demolish'] as const) {
    expect(supportsPointerCompletion(tool)).toBe(false);
    expect(isCompletionClick(tool, 0, 2)).toBe(false);
  }
});
