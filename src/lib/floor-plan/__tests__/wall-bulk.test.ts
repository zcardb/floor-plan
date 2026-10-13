import { describe, expect, it } from 'vitest';
import { blankDesign, referenceDesign } from '../templates';
import { splitWall } from '../wall-split';
import { bearingWalls, clearBearing, collinearWallChains, mergeAllSplits, splitPointCount } from '../wall-bulk';
import { isBearingWall, setWallBearing } from '../wall-policy';
import { length } from '../geometry';
import type { Design } from '../types';

describe('清空分割', () => {
  it('把所有分割过的连续墙段合并回整段，转角保持分开', () => {
    const base = blankDesign();
    let d = splitWall(base, 'outer-0', [1000, 3000]).design;
    d = splitWall(d, 'outer-1', [2000]).design;
    expect(d.walls).toHaveLength(base.walls.length + 3);
    const result = mergeAllSplits(d);
    expect(result.merged).toBe(3);
    expect(result.skipped).toBe(0);
    expect(result.design.walls).toHaveLength(base.walls.length);
    expect(result.design.walls.map(length).sort()).toEqual(base.walls.map(length).sort());
  });
  it('门窗随墙保留位置；没有分割时原样返回', () => {
    const base = { ...blankDesign(), openings: [{ id: 'door', wallId: 'outer-0', kind: 'door' as const, width: 900, offset: 2000 }] };
    const split = splitWall(base, 'outer-0', [1000]).design;
    const merged = mergeAllSplits(split).design;
    const door = merged.openings[0], wall = merged.walls.find(w => w.id === door.wallId)!;
    expect(length(wall)).toBeCloseTo(length(base.walls[0]));
    expect(door.offset).toBeCloseTo(2000);
    const plain = blankDesign();
    expect(mergeAllSplits(plain)).toEqual({ design: plain, merged: 0, skipped: 0 });
  });
  it('keepBearingRuns：承重段与相邻非承重段不合并，默认仍合并', () => {
    const base = blankDesign();
    const split = splitWall(base, 'outer-0', [1000]).design;
    const marked = setWallBearing(split, 'outer-0', true);
    expect(bearingWalls(marked)).toHaveLength(1);
    const kept = mergeAllSplits(marked, { keepBearingRuns: true }).design;
    expect(kept.walls).toHaveLength(marked.walls.length);
    expect(bearingWalls(kept).map(length)).toEqual(bearingWalls(marked).map(length));
    const all = mergeAllSplits(marked).design;
    expect(all.walls).toHaveLength(base.walls.length);
  });
  it('分割段上的承重标记合并后保留', () => {
    const split = splitWall(blankDesign(), 'outer-0', [1000]).design;
    const marked = setWallBearing(split, split.walls[split.walls.length - 1].id, true);
    const merged = mergeAllSplits(marked).design;
    expect(merged.walls.filter(isBearingWall)).toHaveLength(1);
  });
  it('一条直线一拉到底：不同类型、厚度的相接墙段与 T 形交界处都合并为一面墙', () => {
    const base = blankDesign();
    const d: Design = {
      ...base,
      walls: [
        ...base.walls,
        { id: 'p1', a: [0, 3000], b: [2000, 3000], thickness: 120, kind: 'partition' },
        { id: 'p2', a: [2000, 3000], b: [4500, 3000], thickness: 240, kind: 'bearing' },
        { id: 'p3', a: [4500, 3000], b: [6000, 3000], thickness: 120, kind: 'low' },
        // 在 p1/p2 交界处形成 T 形接头的垂直墙，不应打断水平线
        { id: 't', a: [2000, 3000], b: [2000, 6000], thickness: 120, kind: 'partition' },
      ],
      openings: [{ id: 'door', wallId: 'p3', kind: 'door', width: 800, offset: 600 }],
    };
    const result = mergeAllSplits(d);
    expect(result).toMatchObject({ merged: 2, skipped: 0 });
    const line = result.design.walls.filter(w => w.a[1] === 3000 && w.b[1] === 3000);
    expect(line).toHaveLength(1);
    expect(line[0]).toMatchObject({ id: 'p2', kind: 'bearing', thickness: 240, a: [0, 3000], b: [6000, 3000] });
    expect(result.design.walls.some(w => w.id === 't')).toBe(true);
    expect(result.design.openings[0]).toMatchObject({ wallId: 'p2', offset: 5100 });
  });
  it('外围墙优先、含承重段时整面墙保留承重；真实空隙不桥接', () => {
    const base = blankDesign();
    const d: Design = {
      ...base,
      walls: [
        ...base.walls,
        { id: 'e', a: [0, 3000], b: [1000, 3000], thickness: 240, kind: 'exterior' },
        { id: 'b', a: [1000, 3000], b: [2000, 3000], thickness: 240, kind: 'bearing' },
        { id: 'gap', a: [3000, 3000], b: [4000, 3000], thickness: 120, kind: 'partition' },
      ],
    };
    const result = mergeAllSplits(d).design;
    const merged = result.walls.find(w => w.id === 'e')!;
    expect(merged).toMatchObject({ kind: 'exterior', loadBearing: true, a: [0, 3000], b: [2000, 3000] });
    expect(result.walls.some(w => w.id === 'gap')).toBe(true);
    expect(splitPointCount(d)).toBe(1);
  });
  it('参考户型合并后，不再有相接的共线墙段', () => {
    const ref = referenceDesign();
    expect(splitPointCount(ref)).toBeGreaterThan(0);
    const result = mergeAllSplits(ref);
    expect(result.skipped).toBe(0);
    expect(collinearWallChains(result.design)).toEqual([]);
    expect(splitPointCount(result.design)).toBe(0);
    expect(result.design.openings).toHaveLength(ref.openings.length);
    for (const o of result.design.openings) expect(result.design.walls.some(w => w.id === o.wallId)).toBe(true);
  });
  it('合并会让门窗越界或重叠时，该条线保持原样', () => {
    const base = blankDesign();
    const d: Design = {
      ...base,
      walls: [
        ...base.walls,
        { id: 'x', a: [0, 3000], b: [1000, 3000], thickness: 120, kind: 'partition' },
        { id: 'y', a: [1000, 3000], b: [2000, 3000], thickness: 120, kind: 'partition' },
      ],
      openings: [
        { id: 'o1', wallId: 'x', kind: 'door', width: 800, offset: 600 },
        { id: 'o2', wallId: 'y', kind: 'door', width: 800, offset: 300 },
      ],
    };
    const result = mergeAllSplits(d);
    expect(result).toMatchObject({ merged: 0, skipped: 2 });
    expect(result.design.walls).toEqual(d.walls);
  });
});

describe('清空承重', () => {
  it('原始承重墙改为普通隔墙，用户标记全部取消', () => {
    const ref = referenceDesign();
    expect(bearingWalls(ref).length).toBeGreaterThan(0);
    const next = clearBearing(ref);
    expect(bearingWalls(next)).toHaveLength(0);
    expect(next.walls.filter(w => w.kind === 'bearing')).toHaveLength(0);
    expect(next.walls.map(w => [w.id, w.a, w.b, w.thickness])).toEqual(ref.walls.map(w => [w.id, w.a, w.b, w.thickness]));
    const blank = blankDesign();
    const marked = setWallBearing(blank, 'outer-0', true);
    expect(clearBearing(marked).walls.some(isBearingWall)).toBe(false);
    expect(clearBearing(blank)).toBe(blank);
  });
});
