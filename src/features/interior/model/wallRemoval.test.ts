import { describe, expect, it } from 'vitest';
import { blankDesign, designForTemplate, referenceDesign } from '../data/templates';
import { area, inRoom, rebuildRooms, rect, resizeBlank, ringArea, wallPoly } from './geometry';
import { validateDesign } from './validation';
import { isBearingWall, setWallBearing } from './wallPolicy';
import { purgeDemolished, removeWall } from './wallRemoval';
import type { Design, Point, Wall } from './types';

const drawn: Wall = { id: 'inner', kind: 'partition', a: [3000, 0], b: [3000, 6000], thickness: 200 };
const blank = () => rebuildRooms({ ...blankDesign(), walls: [...blankDesign().walls, drawn] });
/** 非空白户型：6 m × 6 m 外框 + x = 2500 的隔墙，两侧各一间。 */
const partition2: Wall = { id: 'inner', kind: 'partition', a: [2500, 0], b: [2500, 6000], thickness: 200 };
const split2 = (): Design => ({
  ...blankDesign(),
  template: 'reference',
  walls: [...blankDesign().walls, partition2],
  rooms: [
    { id: 'small', name: '书房', mat: 'wood', rings: [rect(0, 0, 2400, 6000)] },
    { id: 'big', name: '客厅', mat: 'wood', rings: [rect(2600, 0, 3400, 6000)] },
  ],
  furniture: [],
});
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
    const reference = referenceDesign();
    for (const kind of ['partition', 'exterior', 'low'] as const) {
      const w = reference.walls.find(w => w.kind === kind)!, next = removeWall(reference, w.id);
      expect(next.walls.some(x => x.id === w.id)).toBe(false);
      expect(next.openings.some(o => o.wallId === w.id)).toBe(false);
      expect(validateDesign(JSON.parse(JSON.stringify(next)))).toEqual(next);
    }
  });
  it('删外围墙：不再被围住的房间连同其中的家具一起删除，其余房间原样保留', () => {
    const reference = referenceDesign();
    let opened = 0;
    for (const w of reference.walls.filter(w => w.kind === 'exterior' && !w.id.startsWith('opening-wall-'))) {
      const next = removeWall(reference, w.id);
      const gone = reference.rooms.filter(r => !next.rooms.some(n => n.id === r.id));
      expect(next.rooms.every(r => reference.rooms.some(o => o.id === r.id))).toBe(true);
      if (gone.length) opened++;
      for (const f of reference.furniture) {
        const inGone = gone.some(r => inRoom([f.cx, f.cy], r));
        const inKept = next.rooms.some(r => inRoom([f.cx, f.cy], r));
        if (inGone && !inKept) expect(next.furniture.some(x => x.id === f.id)).toBe(false);
        if (inKept) expect(next.furniture.some(x => x.id === f.id)).toBe(true);
      }
    }
    expect(opened).toBeGreaterThan(0);
  });
  it('删完一间房都不剩时拒绝删除（空白户型删外框墙）', () => {
    expect(() => removeWall(blank(), 'outer-0')).toThrow('删除后将没有房间');
  });
  it('删隔墙合并两侧房间时，家具全部保留', () => {
    const before = split2();
    before.furniture.push(
      { id: 'f1', type: 'bed', name: '床', cx: 1200, cy: 3000, w: 1000, d: 2000, rot: 0, color: '#ccc' },
      { id: 'f2', type: 'sofa', name: '沙发', cx: 4500, cy: 3000, w: 2000, d: 900, rot: 0, color: '#ccc' },
    );
    const next = removeWall(before, partition2.id);
    expect(next.furniture.map(f => f.id)).toEqual(['f1', 'f2']);
  });
  it('删除墙后，相连墙上因它留下的分割点自动清除', () => {
    // 外墙 outer-0 在 x = 3000 处被切成两段，隔墙从切点向下。
    const d = split2();
    const top = d.walls.find(w => w.id === 'outer-0')!;
    const cut: Point = [2500, top.a[1]];
    d.walls = d.walls.flatMap(w => w.id === 'outer-0' ? [{ ...w, b: cut }, { ...w, id: 'outer-0b', a: cut, exteriorRootId: undefined }] : [w]);
    const next = removeWall(d, partition2.id);
    expect(next.walls.some(w => w.id === 'outer-0b')).toBe(false);
    const healed = next.walls.find(w => w.id === 'outer-0')!;
    expect(healed.a).toEqual(top.a);
    expect(healed.b).toEqual(top.b);
  });
  it('参考户型逐面删墙：两侧房间连同墙带并成一间，其余房间与顺序不变', () => {
    const reference = designForTemplate('reference');
    const order = reference.rooms.map(r => r.id);
    const original = (id: string) => reference.rooms.find(r => r.id === id)!;
    let merges = 0;
    for (const w of reference.walls.filter(w => !isBearingWall(w))) {
      const next = removeWall(reference, w.id);
      expect(validateDesign(JSON.parse(JSON.stringify(next)))).toEqual(next);
      const ids = next.rooms.map(r => r.id);
      expect(ids).toEqual(order.filter(id => ids.includes(id)));
      const gone = reference.rooms.filter(r => !ids.includes(r.id));
      const grown = next.rooms.filter(r => area(r) > area(original(r.id)) + 0.05);
      if (!grown.length) continue;
      merges++;
      expect(grown).toHaveLength(1);
      const kept = grown[0]!, before = original(kept.id);
      expect(kept).toMatchObject({ name: before.name, mat: before.mat });
      // 合并后的面积 = 参与合并的房间 + 墙带，不会凭空多出或少掉
      const parts = area(before) + gone.reduce((s, r) => s + area(r), 0);
      const band = ringArea(wallPoly({ ...w, thickness: w.thickness + 100 })) / 1e6;
      expect(area(kept)).toBeGreaterThan(parts - 0.05);
      expect(area(kept)).toBeLessThan(parts + band + 0.05);
    }
    expect(merges).toBeGreaterThan(3);
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
    const d = { ...blank(), walls: blank().walls.filter(w => w.id !== 'outer-0') };
    expect(resizeBlank(d, d.width, d.depth, d.thickness)).toBe(d);
    expect(() => resizeBlank(d, d.width + 10, d.depth, d.thickness)).toThrow('外围墙已单独调整');
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
