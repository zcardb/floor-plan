import { describe, expect, it } from 'vitest';
import { blankDesign, referenceDesign } from '../data/templates';
import { area, rebuildRooms, rect, resizeBlank, ringArea, wallPoly } from './geometry';
import { validateDesign } from './validation';
import { isBearingWall, setWallBearing } from './wallPolicy';
import { purgeDemolished, removeWall } from './wallRemoval';
import type { Design, Point, Wall } from './types';

const drawn: Wall = { id: 'inner', kind: 'partition', a: [3000, 0], b: [3000, 6000], thickness: 200 };
const blank = () => rebuildRooms({ ...blankDesign(), walls: [...blankDesign().walls, drawn] });
const withDoor = (): Design => {
  const d = blank();
  d.openings.push({ id: 'door', wallId: drawn.id, kind: 'door', offset: 2000, width: 900 });
  return d;
};

describe('删除当前墙', () => {
  it('删除自绘隔墙及其门窗并重建房间，结果可再次通过校验', () => {
    const before = withDoor(), next = removeWall(before, drawn.id);
    expect(next.walls.some(w => w.id === drawn.id)).toBe(false);
    expect(next.openings.some(o => o.wallId === drawn.id)).toBe(false);
    expect(next.rooms).toHaveLength(1);
    expect(validateDesign(JSON.parse(JSON.stringify(next)))).toEqual(next);
    expect(before.walls.some(w => w.id === drawn.id)).toBe(true);
  });
  it('外围墙与参考户型的隔墙、外墙、矮墙都可删除，墙上门窗一并删除', () => {
    const outer = removeWall(blank(), 'outer-0');
    expect(outer.walls.some(w => w.id === 'outer-0')).toBe(false);
    expect(validateDesign(JSON.parse(JSON.stringify(outer))).walls).toEqual(outer.walls);
    const reference = referenceDesign();
    for (const kind of ['partition', 'exterior', 'low'] as const) {
      const w = reference.walls.find(w => w.kind === kind)!, next = removeWall(reference, w.id);
      expect(next.walls.some(x => x.id === w.id)).toBe(false);
      expect(next.openings.some(o => o.wallId === w.id)).toBe(false);
      expect(validateDesign(JSON.parse(JSON.stringify(next)))).toEqual(next);
    }
  });
  it('删外围墙：挨着的房间原样保留，不会因为区域开敞被删除', () => {
    const reference = referenceDesign();
    for (const w of reference.walls.filter(w => w.kind === 'exterior' && !w.id.startsWith('opening-wall-')))
      expect(removeWall(reference, w.id).rooms).toBe(reference.rooms);
    const d = removeWall(blank(), 'outer-0');
    expect(d.rooms).toHaveLength(2);
  });
  it('参考户型逐面删墙：两侧房间连同墙带并成一间，其余房间与顺序不变', () => {
    const reference = referenceDesign();
    const order = reference.rooms.map(r => r.id);
    let merges = 0;
    for (const w of reference.walls.filter(w => !isBearingWall(w))) {
      const next = removeWall(reference, w.id);
      expect(validateDesign(JSON.parse(JSON.stringify(next)))).toEqual(next);
      const ids = next.rooms.map(r => r.id);
      expect(ids).toEqual(order.filter(id => ids.includes(id)));
      const gone = reference.rooms.filter(r => !ids.includes(r.id));
      const changed = next.rooms.filter(r => r.rings !== reference.rooms.find(o => o.id === r.id)!.rings);
      if (!gone.length && !changed.length) continue;
      merges++;
      expect(changed).toHaveLength(1);
      const kept = changed[0]!, original = reference.rooms.find(r => r.id === kept.id)!;
      expect(next.rooms.find(r => r.id === kept.id)).toMatchObject({ name: original.name, mat: original.mat });
      // 合并后的面积 = 参与合并的房间 + 墙带（含两侧各 50 mm 的误差容差），不会凭空多出或少掉
      const parts = area(original) + gone.reduce((s, r) => s + area(r), 0);
      const band = ringArea(wallPoly({ ...w, thickness: w.thickness + 100 })) / 1e6;
      expect(area(kept)).toBeGreaterThan(parts - 0.01);
      expect(area(kept)).toBeLessThan(parts + band + 0.01);
      expect(gone.every(r => area(r) <= area(original))).toBe(true);
    }
    expect(merges).toBeGreaterThan(5);
    // 客卫浴 / 餐厅之间的隔墙：餐厅面积更大，保留餐厅
    const between = removeWall(reference, 'w34');
    expect(between.rooms.some(r => r.id === 'gbath')).toBe(false);
    expect(between.rooms.find(r => r.id === 'dining')!.name).toBe('餐厅');
  });
  it('删墙后清掉房间轮廓里残留的墙带碎洞（不再跟着并出来的房间走）', () => {
    const partition: Wall = { id: 'inner', kind: 'partition', a: [2500, 0], b: [2500, 6000], thickness: 200 };
    const hole: Point[] = [[1000, 1000], [1000, 1350], [1120, 1350], [1120, 1000]];
    const before: Design = {
      ...blankDesign(),
      template: 'reference',
      walls: [...blankDesign().walls, partition],
      rooms: [
        { id: 'small', name: '小间', mat: 'wood', rings: [rect(0, 0, 2400, 6000), hole] },
        { id: 'big', name: '大间', mat: 'wood', rings: [rect(2600, 0, 3400, 6000)] },
      ],
    };
    const next = removeWall(before, partition.id);
    expect(next.rooms.length).toBeGreaterThan(0);
    expect(next.rooms.every(r => r.rings.length === 1)).toBe(true);
    expect(validateDesign(JSON.parse(JSON.stringify(next)))).toEqual(next);
  });
  it('承重墙（原始或手动标记）拒绝删除，取消标记后可删；不存在与最后一面墙拒绝', () => {
    const reference = referenceDesign(), original = reference.walls.find(w => w.kind === 'bearing')!;
    expect(() => removeWall(reference, original.id)).toThrow('取消承重');
    expect(removeWall(setWallBearing(reference, original.id, false), original.id).walls.some(w => w.id === original.id)).toBe(false);
    expect(() => removeWall(setWallBearing(blank(), drawn.id, true), drawn.id)).toThrow('取消承重');
    expect(() => removeWall(blank(), 'missing')).toThrow('不存在');
    expect(() => removeWall({ ...blank(), walls: [drawn] }, drawn.id)).toThrow('至少保留');
  });
  it('删除外围墙后，户型设置不能整体重设尺寸', () => {
    const d = removeWall(blank(), 'outer-0');
    expect(resizeBlank(d, d.width, d.depth, d.thickness)).toBe(d);
    expect(() => resizeBlank(d, d.width + 10, d.depth, d.thickness)).toThrow('已删除外围墙');
  });
});

describe('旧版拆除标记迁移', () => {
  it('加载时删除已标记拆除的墙及门窗，清空 demolished，未知 id 忽略', () => {
    const d = { ...withDoor(), demolished: [drawn.id, 'missing'] };
    const next = validateDesign(JSON.parse(JSON.stringify(d)));
    expect(next.walls.some(w => w.id === drawn.id)).toBe(false);
    expect(next.openings.some(o => o.wallId === drawn.id)).toBe(false);
    expect(next.demolished).toEqual([]);
    expect(purgeDemolished(d).walls).toHaveLength(d.walls.length - 1);
    expect(d.demolished).toEqual([drawn.id, 'missing']);
  });
});
