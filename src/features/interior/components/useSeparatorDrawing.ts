import { addSeparator } from '../model/separators';
import type { Design } from '../model/types';
import { useSegmentDrawing } from './useSegmentDrawing';

/** 房间分隔线：与绘墙同样的连续点选与吸附，每段提交后房间立即按「墙 + 分隔线」重算。 */
export function useSeparatorDrawing(enabled: boolean, design: React.RefObject<Design>, scale: number, snap: boolean,
  commit: (d: Design) => void, done: () => void) {
  return useSegmentDrawing(enabled, design, scale, snap, (d, a, b) => commit(addSeparator(d, a, b).design), done);
}
