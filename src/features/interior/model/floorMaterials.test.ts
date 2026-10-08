import { describe, expect, it } from 'vitest';
import { referenceDesign } from '../data/templates';
import { builtinFloors, floorMaterialOf, floorMaterialsOf } from './floorMaterials';
import { validateDesign } from './validation';
import { calculateCosts, priceOf } from './costs';
import { defaultProcurement } from './materialProcurement';
import type { CustomFloor, Design } from './types';

const tile: CustomFloor = { key: 'custom-11111111-1111-4111-8111-111111111111', name: '仿古砖', pattern: 'tile', length: 600, width: 300, color: '#c9b79a', price: 180 };
const poured: CustomFloor = { key: 'custom-22222222-2222-4222-8222-222222222222', name: '整体浇筑', pattern: 'seamless', color: '#b8b8b0', price: null };
const withFloors = (): Design => {
  const d = referenceDesign();
  return { ...d, customFloors: [tile, poured], rooms: d.rooms.map((r, i) => (i === 0 ? { ...r, mat: tile.key } : i === 1 ? { ...r, mat: poured.key } : r)) };
};

describe('自定义地面材质', () => {
  it('合并内置与项目自定义地面', () => {
    const all = floorMaterialsOf(withFloors());
    expect(Object.keys(all)).toEqual([...Object.keys(builtinFloors), tile.key, poured.key]);
    expect(all[poured.key]).toEqual({ name: '整体浇筑', price: null, color: '#b8b8b0', pattern: 'seamless', custom: true });
  });
  it('未知 key 回退到内置木地板，不崩溃', () => {
    expect(floorMaterialOf(referenceDesign(), 'missing').name).toBe(builtinFloors.wood.name);
  });
  it('方案校验接受引用自定义地面的房间并原样往返', () => {
    const d = withFloors();
    expect(validateDesign(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });
  it.each([
    ['非法样式', { ...tile, pattern: 'hex' }],
    ['非法颜色', { ...tile, color: 'red' }],
    ['尺寸过小', { ...tile, length: 10 }],
    ['无缝带尺寸', { ...poured, length: 600, width: 600 }],
    ['非法 key', { ...tile, key: 'wood' }],
  ])('拒绝%s', (_label, floor) => {
    expect(() => validateDesign({ ...withFloors(), customFloors: [floor, poured] })).toThrow();
  });
  it('拒绝引用不存在地面的房间，旧项目不受影响', () => {
    const d = referenceDesign();
    expect(() => validateDesign({ ...d, rooms: d.rooms.map(r => ({ ...r, mat: tile.key })) })).toThrow();
    expect(validateDesign(d).customFloors).toBeUndefined();
  });
  it('成本使用自定义地面的名称与单价，未定价为空', () => {
    const d = withFloors();
    expect(priceOf(d, 'floorPrices', tile.key)).toBe(180);
    expect(priceOf(d, 'floorPrices', poured.key)).toBeNull();
    expect(calculateCosts(d).hard.find(r => r.key === tile.key)?.name).toBe('仿古砖');
  });
  it('采购默认尺寸取自定义方砖规格', () => {
    expect(defaultProcurement(tile.key, withFloors())).toMatchObject({ length: 600, width: 300 });
    expect(defaultProcurement(poured.key, withFloors())).toEqual({ unit: 'm²', waste: 5 });
  });
});
