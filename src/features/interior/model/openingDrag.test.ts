import { describe, expect, it } from 'vitest';
import { blankDesign } from '../data/templates';
import { dragOpening, dragOpeningEdge } from './openingDrag';
import type { Opening, Point } from './types';

function fixture(kind: Opening['kind'] = 'door', a: Point = [0, 0], b: Point = [6000, 0]) {
  return { ...blankDesign(), walls: [{ id: 'wall', a, b, thickness: 200, kind: 'partition' as const }],
    openings: [{ id: 'opening', wallId: 'wall', kind, offset: 2000, width: 1000 }] };
}
describe('门窗沿墙拖动', () => {
  it.each(['door', 'window'] as const)('%s 保留抓取偏差且只改变沿墙位置', kind => {
    const d = fixture(kind);
    const next = dragOpening(d, 'opening', [1700, -600], [2700, 400])!;
    expect(next.openings[0]).toEqual({ ...d.openings[0], offset: 3000 });
    expect(d.openings[0].offset).toBe(2000);
    expect(next.walls).toBe(d.walls);
  });
  it.each([
    { a: [0, 0], b: [0, 6000], start: [300, 1700], point: [-500, 2700] },
    { a: [0, 0], b: [3600, 4800], start: [1200, 1600], point: [1800, 2400] },
    { a: [6000, 0], b: [0, 0], start: [4000, 0], point: [3000, 0] },
  ])('垂直、斜墙与反向墙统一投影 %#', ({ a, b, start, point }) => {
    expect(dragOpening(fixture('window', a as Point, b as Point), 'opening', start as Point, point as Point)!.openings[0].offset).toBeCloseTo(3000);
  });
  it('夹取墙端，垂直于墙的移动不改变位置', () => {
    const d = fixture();
    expect(dragOpening(d, 'opening', [2000, 0], [-5000, 0])!.openings[0].offset).toBe(500);
    expect(dragOpening(d, 'opening', [2000, 0], [10000, 0])!.openings[0].offset).toBe(5500);
    expect(dragOpening(d, 'opening', [2000, 0], [2000, 800])!.openings[0].offset).toBe(2000);
  });
  it('拒绝同墙重叠，允许恰好相接，其他墙不参与碰撞', () => {
    const d = fixture();
    d.openings.push({ ...d.openings[0], id: 'neighbor', offset: 4000 });
    expect(dragOpening(d, 'opening', [2000, 0], [3500, 0])).toBeNull();
    expect(dragOpening(d, 'opening', [2000, 0], [3000, 0])!.openings[0].offset).toBe(3000);
    d.openings[1].wallId = 'other';
    expect(dragOpening(d, 'opening', [2000, 0], [4000, 0])!.openings[0].wallId).toBe('wall');
  });
  it('对象或所属墙缺失及墙段无法容纳门窗时不更新', () => {
    const d = fixture();
    expect(dragOpening(d, 'missing', [0, 0], [100, 0])).toBeNull();
    expect(dragOpening({ ...d, walls: [] }, 'opening', [0, 0], [100, 0])).toBeNull();
    expect(dragOpening(fixture('door', [0, 0], [500, 0]), 'opening', [0, 0], [100, 0])).toBeNull();
  });
});

describe('dragOpeningEdge（两端手柄改宽度）', () => {
  // 横墙 0→6000，门 offset 3000、宽 800：两端在 2600 / 3400。
  const setup = () => {
    const d = blankDesign();
    const wall = d.walls[0];
    d.walls = [{ ...wall, a: [0, 0], b: [6000, 0] }, ...d.walls.slice(1)];
    d.openings = [{ id: 'door', wallId: wall.id, kind: 'door', offset: 3000, width: 800 }];
    return d;
  };
  const ends = (d: ReturnType<typeof setup>) => { const o = d.openings.find(x => x.id === 'door')!; return [o.offset - o.width / 2, o.offset + o.width / 2]; };

  it('拖右端：右端跟随（按步进取整），左端不动', () => {
    expect(ends(dragOpeningEdge(setup(), 'door', 'b', [3912, 150])!)).toEqual([2600, 3900]);
  });
  it('拖左端：左端跟随，右端不动；拉过对端时自动翻转', () => {
    expect(ends(dragOpeningEdge(setup(), 'door', 'a', [2000, 0])!)).toEqual([2000, 3400]);
    expect(ends(dragOpeningEdge(setup(), 'door', 'a', [4000, 0])!)).toEqual([3400, 4000]);
  });
  it('不小于 10 cm、不超出墙段、不与同墙门窗重叠', () => {
    expect(dragOpeningEdge(setup(), 'door', 'b', [2650, 0])).toBeNull();
    expect(ends(dragOpeningEdge(setup(), 'door', 'b', [9000, 0])!)).toEqual([2600, 6000]);
    const d = setup();
    d.openings.push({ id: 'win', wallId: d.walls[0].id, kind: 'window', offset: 4500, width: 1000 });
    expect(dragOpeningEdge(d, 'door', 'b', [4200, 0])).toBeNull();
  });
});
