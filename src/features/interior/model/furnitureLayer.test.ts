import { describe, expect, it } from 'vitest';
import { blankDesign } from '../data/templates';
import { layerStatus, reorderFurniture } from './furnitureLayer';
import type { Design, Furniture } from './types';

const item = (id: string) => ({ id, name: id, type: 'sofa', cx: 0, cy: 0, w: 100, d: 100, rot: 0 }) as unknown as Furniture;
const design = (...ids: string[]): Design => ({ ...blankDesign(), furniture: ids.map(item) });
const order = (d: Design) => d.furniture.map(f => f.id).join('');

describe('家具图层顺序', () => {
  it('置顶 / 置底：移到数组末尾 / 开头，其余顺序不变', () => {
    expect(order(reorderFurniture(design('a', 'b', 'c', 'd'), ['b'], 'front'))).toBe('acdb');
    expect(order(reorderFurniture(design('a', 'b', 'c', 'd'), ['c'], 'back'))).toBe('cabd');
  });
  it('上移 / 下移一层：只越过相邻的一件', () => {
    expect(order(reorderFurniture(design('a', 'b', 'c', 'd'), ['b'], 'forward'))).toBe('acbd');
    expect(order(reorderFurniture(design('a', 'b', 'c', 'd'), ['c'], 'backward'))).toBe('acbd');
  });
  it('多选整体调整，组内相对顺序保持', () => {
    expect(order(reorderFurniture(design('a', 'b', 'c', 'd', 'e'), ['b', 'd'], 'front'))).toBe('acebd');
    expect(order(reorderFurniture(design('a', 'b', 'c', 'd', 'e'), ['b', 'd'], 'forward'))).toBe('acbed');
    expect(order(reorderFurniture(design('a', 'b', 'c', 'd', 'e'), ['b', 'd'], 'backward'))).toBe('badce');
  });
  it('已在最上 / 最下层时返回原设计（不产生撤销记录），状态可用于禁用菜单项', () => {
    const d = design('a', 'b', 'c');
    expect(reorderFurniture(d, ['c'], 'front')).toBe(d);
    expect(reorderFurniture(d, ['c'], 'forward')).toBe(d);
    expect(reorderFurniture(d, ['a'], 'back')).toBe(d);
    expect(layerStatus(d, ['c'])).toEqual({ atTop: true, atBottom: false });
    expect(layerStatus(d, ['a', 'b'])).toEqual({ atTop: false, atBottom: true });
    expect(layerStatus(d, ['b'])).toEqual({ atTop: false, atBottom: false });
  });
});
