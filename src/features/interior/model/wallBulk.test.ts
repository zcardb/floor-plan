import { describe, expect, it } from 'vitest';
import { blankDesign, referenceDesign } from '../data/templates';
import { splitWall } from './wallSplit';
import { bearingWalls, clearBearing, mergeAllSplits } from './wallBulk';
import { isBearingWall, setWallBearing } from './wallPolicy';
import { length } from './geometry';

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
  it('分割段上的承重标记合并后保留', () => {
    const split = splitWall(blankDesign(), 'outer-0', [1000]).design;
    const marked = setWallBearing(split, split.walls[split.walls.length - 1].id, true);
    const merged = mergeAllSplits(marked).design;
    expect(merged.walls.filter(isBearingWall)).toHaveLength(1);
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
