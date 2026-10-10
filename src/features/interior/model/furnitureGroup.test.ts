import { describe, expect, it } from 'vitest';
import { blankDesign } from '../data/templates';
import { furnitureInRect, groupBounds, groupIds, moveGroup, normalizeRect, removeGroup, selectionOf } from './furnitureGroup';
import type { Design, Furniture } from './types';

const item = (id: string, cx: number, cy: number, rot = 0): Furniture => ({ id, type: 'chair', name: id, cx, cy, w: 400, d: 400, rot, color: '#888888' });
const design = (): Design => ({ ...blankDesign(), furniture: [item('a', 1000, 1000), item('b', 2000, 1000), item('c', 4000, 4000, 45)] });

describe('框选家具', () => {
  it('任意方向拖出的框都能规范化', () => {
    expect(normalizeRect([3000, 2000], [500, 100])).toEqual({ x1: 500, y1: 100, x2: 3000, y2: 2000 });
  });
  it('家具四角全部在框内才选中，一角在外不选', () => {
    const d = design();
    expect(furnitureInRect(d, normalizeRect([700, 700], [2300, 1300]))).toEqual(['a', 'b']);
    expect(furnitureInRect(d, normalizeRect([700, 700], [2100, 1300]))).toEqual(['a']);
    // 旋转 45° 的家具包围框比本体大。
    expect(furnitureInRect(d, normalizeRect([3790, 3790], [4210, 4210]))).toEqual([]);
    expect(furnitureInRect(d, normalizeRect([3700, 3700], [4300, 4300]))).toEqual(['c']);
  });
  it('圈选结果：0 件清空、1 件单选、多件成组', () => {
    expect(selectionOf([])).toBeNull();
    expect(selectionOf(['a'])).toEqual({ kind: 'furniture', id: 'a' });
    expect(selectionOf(['a', 'b'])).toEqual({ kind: 'group', ids: ['a', 'b'] });
  });
  it('整组平移保持相对位置，组外家具不动', () => {
    const next = moveGroup(design(), ['a', 'b'], [150, -50]);
    const [a, b, c] = next.furniture;
    expect([a!.cx, a!.cy, b!.cx, b!.cy]).toEqual([1150, 950, 2150, 950]);
    expect(b!.cx - a!.cx).toBe(1000);
    expect([c!.cx, c!.cy]).toEqual([4000, 4000]);
  });
  it('失效的 id 被过滤，整组外接框与删除', () => {
    const d = design();
    expect(groupIds(d, { kind: 'group', ids: ['a', 'gone', 'b'] })).toEqual(['a', 'b']);
    expect(groupIds(d, { kind: 'furniture', id: 'a' })).toEqual([]);
    expect(groupBounds(d, ['a', 'b'])).toEqual([[800, 800], [2200, 800], [2200, 1200], [800, 1200]]);
    expect(removeGroup(d, ['a', 'b']).furniture.map(f => f.id)).toEqual(['c']);
  });
});
