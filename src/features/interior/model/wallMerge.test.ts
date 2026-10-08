import { describe, expect, it } from 'vitest';
import { blankDesign } from '../data/templates';
import { splitWall } from './wallSplit';
import { mergeWall, wallMergeGroup } from './wallMerge';
import { setWallBearing, isBearingWall } from './wallPolicy';
import { calculateCosts } from './costs';
import { validateDesign } from './validation';
import { length, resizeBlank } from './geometry';
import { createDrawingDocument } from './drawingDocument';
const layers = { grid: false, dims: true, labels: true, furn: true, bearing: true, snap: true };
describe('取消分割合并连续墙', () => {
  it('局部承重外围段合并恢复根ID、洞口和整段保护，费用不变', () => {
    const d = blankDesign(); d.openings.push({ id: 'window', wallId: 'outer-0', kind: 'window', offset: 2000, width: 1000 });
    const split = splitWall(d, 'outer-0', [300, 800], 1);
    const marked = setWallBearing(split.design, split.selectedId, true);
    const next = mergeWall(marked, split.selectedId);
    expect(next.selectedId).toBe('outer-0'); expect(next.design.walls).toHaveLength(4);
    expect(next.design.walls[0].exteriorRootId).toBeUndefined(); expect(isBearingWall(next.design.walls[0])).toBe(true);
    expect(next.design.openings).toEqual(d.openings); expect(next.design.rooms).toBe(d.rooms);
    expect(calculateCosts(next.design)).toEqual(calculateCosts(d));
    expect(validateDesign(JSON.parse(JSON.stringify(next.design))).walls).toEqual(next.design.walls);
    expect(() => resizeBlank(next.design, d.width + 10, d.depth, d.thickness)).toThrow('承重');
  });
  it('反向门迁移保持世界开向和导出，内部段可再次分割', () => {
    const d = blankDesign(); d.walls.push({ id: 'p', a: [1000, 0], b: [1000, 3000], thickness: 240, kind: 'partition' }, { id: 'q', a: [1000, 6000], b: [1000, 3000], thickness: 240, kind: 'partition' });
    d.openings.push({ id: 'door', wallId: 'q', kind: 'door', offset: 1000, width: 900 });
    const next = mergeWall(d, 'p').design;
    expect(next.openings[0]).toMatchObject({ wallId: 'p', offset: 5000, hinge: 'end', swingSide: 1 });
    const openings = (design: typeof d) => createDrawingDocument(design, layers).entities.filter(e => e.layer === 'OPENINGS');
    const before = openings(d), after = openings(next);
    expect(after[0]).toEqual(before[0]);
    expect(splitWall(next, 'p', [300]).design.walls).toHaveLength(d.walls.length);
  });
  it.each(['thickness', 'kind', 'color', 'demolished', 'gap', 'root', 'overlap'])('拒绝不兼容墙带 %s', key => {
    const split = splitWall(blankDesign(), 'outer-0', [300]); const d = split.design;
    const q = d.walls[1];
    if (key === 'thickness') q.thickness += 10;
    if (key === 'kind') q.kind = 'partition';
    if (key === 'color') q.color = '#abcdef';
    if (key === 'demolished') d.demolished.push(q.id);
    if (key === 'gap') q.a[0] += 10;
    if (key === 'root') q.exteriorRootId = 'different';
    if (key === 'overlap') q.a[0] -= 50;
    expect(wallMergeGroup(d, 'outer-0')).toEqual([]); expect(() => mergeWall(d, 'outer-0')).toThrow();
  });
  it('不同色子段只局部合并，保留root和其他分段', () => {
    const d = splitWall(blankDesign(), 'outer-0', [300, 800]).design; d.walls[2].color = '#abcdef';
    const next = mergeWall(d, 'outer-0').design;
    expect(next.walls[0].exteriorRootId).toBe('outer-0'); expect(length(next.walls[0])).toBe(800);
    expect(() => resizeBlank(next, next.width + 10, next.depth, next.thickness)).toThrow('已分割');
  });
  it('原始承重合并保持锁定、未知ID拒绝，洞口冲突原子拒绝', () => {
    const d = splitWall(blankDesign(), 'outer-0', [300]).design;
    d.walls[0].kind = 'bearing'; d.walls[1].kind = 'bearing';
    const next = mergeWall(d, 'outer-0').design; expect(next.walls[0].kind).toBe('bearing');
    expect(() => setWallBearing(next, 'outer-0', false)).toThrow(); expect(() => mergeWall(d, 'missing')).toThrow();
    d.openings.push({ id: 'o', wallId: 'outer-0', kind: 'door', offset: 250, width: 900 }, { id: 'o2', wallId: d.walls[1].id, kind: 'window', offset: 50, width: 900 });
    const before = JSON.stringify(d); expect(() => mergeWall(d, 'outer-0')).toThrow('洞口'); expect(JSON.stringify(d)).toBe(before);
  });
});
