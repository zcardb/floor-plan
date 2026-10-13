import { describe, expect, it } from 'vitest';
import { blankDesign } from '../templates';
import { duplicateFurniture, expandToGroups, furnitureInRect, groupBounds, groupFurniture, groupIds, isPersistentGroup, moveGroup, normalizeRect, persistentGroupOf, removeGroup, selectionOf, ungroupFurniture } from '../furniture-group';
import type { Design, Furniture } from '../types';

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

describe('家具组合', () => {
  it('组合写入同一个 groupId，点中任意一件都得到整组', () => {
    const d = groupFurniture(design(), ['a', 'b'], 'g1');
    expect(d.furniture.map(f => f.groupId)).toEqual(['g1', 'g1', undefined]);
    expect(persistentGroupOf(d, 'b')).toEqual(['a', 'b']);
    expect(persistentGroupOf(d, 'c')).toEqual(['c']);
    expect(isPersistentGroup(d, ['a', 'b'])).toBe(true);
    expect(isPersistentGroup(d, ['a', 'b', 'c'])).toBe(false);
  });
  it('框到组合里的一件即补全整组；与已有组合再组合时合并为一组', () => {
    const d = groupFurniture(design(), ['a', 'b'], 'g1');
    expect(expandToGroups(d, ['a'])).toEqual(['a', 'b']);
    const merged = groupFurniture(d, ['b', 'c'], 'g2');
    expect(merged.furniture.map(f => f.groupId)).toEqual(['g2', 'g2', 'g2']);
  });
  it('解除组合清除 groupId；少于两件不组合；旧数据（无 groupId）不受影响', () => {
    const d = groupFurniture(design(), ['a', 'b'], 'g1');
    const free = ungroupFurniture(d, ['a', 'b']);
    expect(free.furniture.every(f => !('groupId' in f))).toBe(true);
    expect(groupFurniture(design(), ['a'], 'g1').furniture.every(f => !f.groupId)).toBe(true);
    const legacy = design();
    expect(ungroupFurniture(legacy, ['a'])).toBe(legacy);
    expect(expandToGroups(legacy, ['a'])).toEqual(['a']);
  });
});

describe('复制家具', () => {
  it('单件：复制件偏移 200mm、有新 id、不改变原件', () => {
    const d = design();
    const r = duplicateFurniture(d, ['a']);
    expect(r.ids).toHaveLength(1);
    const copy = r.design.furniture.find(f => f.id === r.ids[0])!;
    expect({ cx: copy.cx, cy: copy.cy }).toEqual({ cx: 1200, cy: 1200 });
    expect(copy.name).toBe('a');
    expect(d.furniture).toHaveLength(3);
    expect(r.design.furniture).toHaveLength(4);
  });
  it('组合：整组一起复制，相对位置不变，复制件是新组合（与原组合、彼此都不同）', () => {
    const d = groupFurniture(design(), ['a', 'b'], 'g1');
    const r = duplicateFurniture(d, ['a', 'b']);
    expect(r.ids).toHaveLength(2);
    const copies = r.design.furniture.filter(f => r.ids.includes(f.id));
    expect(copies.map(f => [f.cx - 1000, f.cy - 1200])).toEqual([[200, 0], [1200, 0]]);
    expect(new Set(copies.map(f => f.groupId)).size).toBe(1);
    expect(copies[0].groupId).not.toBe('g1');
    expect(isPersistentGroup(r.design, r.ids)).toBe(true);
  });
  it('只选组合里一件也复制整组；没有选中时不改动', () => {
    const d = groupFurniture(design(), ['a', 'b'], 'g1');
    expect(duplicateFurniture(d, ['b']).ids).toHaveLength(2);
    const none = duplicateFurniture(d, []);
    expect(none.ids).toEqual([]);
    expect(none.design).toBe(d);
  });
});
