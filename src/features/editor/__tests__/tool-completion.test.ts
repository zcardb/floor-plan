import { expect, it } from 'vitest';
import { isCompletionClick, supportsPointerCompletion } from '../model/tool-completion';

it('仅绘墙允许双击或右键完成，首下单击和其他工具不受影响', () => {
  const wall = 'wall' as const;
  expect(supportsPointerCompletion(wall)).toBe(true);
  expect(isCompletionClick(wall, 0, 1)).toBe(false);
  expect(isCompletionClick(wall, 0, 2)).toBe(true);
  expect(isCompletionClick(wall, 2, 2)).toBe(false);
  for (const tool of ['select', 'door', 'window'] as const) {
    expect(supportsPointerCompletion(tool)).toBe(false);
    expect(isCompletionClick(tool, 0, 2)).toBe(false);
  }
});
