import { describe, expect, it } from 'vitest';
import { blankDesign } from '../data/templates';
import { splitWall } from './wallSplit';
import { displayOffset, originalCuts, originalSegment, wallSplitDraft } from './wallSplitDraft';

describe('分割方向草稿', () => {
  it('交换后从B端量取并映射回原方向，两次交换恢复', () => {
    expect(originalCuts(10000, [300], true)).toEqual([9700]);
    expect(originalCuts(10000, [300, 800], true)).toEqual([9200, 9700]);
    expect(originalCuts(10000, [300, 800], false)).toEqual([300, 800]);
    expect(originalSegment(3, 0, true)).toBe(2); expect(originalSegment(3, originalSegment(3, 1, true), true)).toBe(1);
    expect(displayOffset(10000, displayOffset(10000, 9700, true), true)).toBe(9700);
  });
  it('反向应用选中靠近原b端的短段，门窗世界位置不变', () => {
    const d = blankDesign(); d.openings.push({ id: 'w', wallId: 'outer-0', kind: 'window', offset: 2000, width: 800 });
    const L = 6240; const draft = wallSplitDraft(d, 'outer-0', L, [300], true);
    expect(draft.cuts).toEqual([L - 300]);
    const result = splitWall(d, 'outer-0', draft.cuts, originalSegment(2, 0, true));
    const selected = result.design.walls.find(w => w.id === result.selectedId)!;
    expect(Math.hypot(selected.b[0] - selected.a[0], selected.b[1] - selected.a[1])).toBeCloseTo(300);
    expect(selected.b).toEqual(d.walls[0].b);
    const o = result.design.openings[0], host = result.design.walls.find(w => w.id === o.wallId)!;
    expect(host.a[0] + o.offset).toBe(d.walls[0].a[0] + 2000);
  });
  it('反向非法距离沿用校验，不返回切点', () => {
    const d = blankDesign(); d.openings.push({ id: 'w', wallId: 'outer-0', kind: 'window', offset: 5700, width: 800 });
    for (const distances of [[NaN], [20000], [10], [800, 300], [300, 300]]) expect(wallSplitDraft(d, 'outer-0', 6240, distances, true).intervals).toEqual([]);
    expect(wallSplitDraft(d, 'outer-0', 6240, [540], true).error).toContain('洞口');
  });
});
