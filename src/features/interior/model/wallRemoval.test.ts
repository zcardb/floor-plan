import { describe, expect, it } from 'vitest';
import { blankDesign, referenceDesign } from '../data/templates';
import { rebuildRooms, resizeBlank } from './geometry';
import { validateDesign } from './validation';
import { setWallBearing } from './wallPolicy';
import { purgeDemolished, removeWall } from './wallRemoval';
import type { Design, Wall } from './types';

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
      expect(next.rooms).toBe(reference.rooms);
    }
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
