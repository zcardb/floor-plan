import { describe, expect, it } from 'vitest';
import { designForTemplate, referenceDesign } from '../templates';
import { applyRoomFloor, builtinFloors, floorMaterialOf, floorMaterialsOf, pickableFloors } from '../floor-materials';
import { validateDesign } from '../validation';
import { calculateCosts, priceOf } from '../costs';
import { defaultProcurement } from '../material-procurement';
import type { CustomFloor, Design } from '../types';

const tile: CustomFloor = { key: 'custom-11111111-1111-4111-8111-111111111111', name: '仿古砖', pattern: 'tile', length: 600, width: 300, color: '#c9b79a', price: 180 };
const poured: CustomFloor = { key: 'custom-22222222-2222-4222-8222-222222222222', name: '整体浇筑', pattern: 'seamless', color: '#b8b8b0', price: null };
const withFloors = (): Design => {
  const d = designForTemplate('reference');
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

describe('房间直接选择账号地面库', () => {
  const concrete: CustomFloor = { key: 'custom-33333333-3333-4333-8333-333333333333', name: '混凝土浇筑', pattern: 'seamless', color: '#9a9a94', price: 50 };
  it('账号库中未加入项目的地面追加在后，已加入的不重复', () => {
    const list = pickableFloors(withFloors(), [tile, concrete, concrete]);
    expect(list.map(f => f.key)).toEqual([...Object.keys(builtinFloors), tile.key, poured.key, concrete.key]);
    expect(list.filter(f => f.fromAccount).map(f => f.key)).toEqual([concrete.key]);
  });
  it('账号库为空时只返回项目已有地面', () => {
    expect(pickableFloors(referenceDesign(), []).every(f => !f.fromAccount)).toBe(true);
  });
  it('首次选择账号地面写入项目并应用，可保存往返；再次选择不重复追加', () => {
    const d = designForTemplate('reference'), room = d.rooms[0].id;
    const once = applyRoomFloor(d, room, concrete.key, [concrete]);
    expect(once.customFloors).toEqual([concrete]);
    expect(once.rooms[0].mat).toBe(concrete.key);
    expect(priceOf(once, 'floorPrices', concrete.key)).toBe(50);
    expect(validateDesign(JSON.parse(JSON.stringify(once)))).toEqual(once);
    const twice = applyRoomFloor(once, d.rooms[1].id, concrete.key, [concrete]);
    expect(twice.customFloors).toHaveLength(1);
    expect(applyRoomFloor(d, room, 'tile800', []).customFloors).toBeUndefined();
  });
  it('未知地面抛错', () => {
    expect(() => applyRoomFloor(referenceDesign(), 'x', concrete.key, [])).toThrow();
  });
});
