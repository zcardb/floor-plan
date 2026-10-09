import { describe, expect, it } from 'vitest';
import { blankDesign } from '../data/templates';
import { area, rect } from './geometry';
import { mergeRoomsAcrossWall } from './roomMerge';
import { validateDesign } from './validation';
import { removeWall } from './wallRemoval';
import type { Design, Room, Wall } from './types';

/** 6 m × 6 m 外框（墙厚 240，净空 0–6000）+ x = 2500 的一面 200 厚隔墙；非空白户型，房间按净空手写。 */
const partition: Wall = { id: 'inner', kind: 'partition', a: [2500, 0], b: [2500, 6000], thickness: 200 };
const small: Room = { id: 'small', name: '书房', rings: [rect(0, 0, 2400, 6000)], mat: 'wood' };
const big: Room = { id: 'big', name: '客厅', rings: [rect(2600, 0, 3400, 6000)], mat: 'tile800', counted: false };
const decoy: Room = { id: 'decoy', name: '别处', rings: [rect(10000, 10000, 1000, 1000)], mat: 'wood' };
const split = (): Design => ({
  ...blankDesign(),
  template: 'reference',
  walls: [...blankDesign().walls, partition],
  rooms: [small, decoy, big],
});
const roundTrip = (d: Design) => validateDesign(JSON.parse(JSON.stringify(d)));

describe('删墙后合并两侧房间', () => {
  it('两侧各一间：连同墙带并成一间，属性与位置取面积较大的那一间', () => {
    const before = split(), next = removeWall(before, partition.id);
    expect(next.rooms.map(r => r.id)).toEqual(['decoy', 'big']);
    const merged = next.rooms[1]!;
    expect(merged).toMatchObject({ id: 'big', name: '客厅', mat: 'tile800', counted: false });
    expect(merged.rings).toHaveLength(1);
    // 14.4 + 20.4 + 墙带 1.2 = 整个净空 36 m²，中间不再留缝
    expect(area(merged)).toBeCloseTo(area(small) + area(big) + 1.2, 3);
    expect(area(merged)).toBeCloseTo(36, 3);
    expect(roundTrip(next)).toEqual(next);
    expect(before.rooms).toHaveLength(3);
  });

  it('房间环与墙面之间有建模误差（几十毫米）时仍能并成一整块', () => {
    const before = split();
    before.rooms = [small, { ...big, rings: [rect(2630, 0, 3370, 6000)] }];
    const next = removeWall(before, partition.id);
    expect(next.rooms.map(r => r.id)).toEqual(['big']);
    expect(area(next.rooms[0]!)).toBeCloseTo(36, 3);
  });

  it('墙两侧是同一个房间（墙垛缺口）：只补上它自己的缺口', () => {
    const stub: Wall = { id: 'stub', kind: 'partition', a: [2500, 0], b: [2500, 2000], thickness: 200 };
    const room: Room = { id: 'one', name: '大厅', mat: 'wood', rings: [[[0, 0], [2400, 0], [2400, 2000], [2600, 2000], [2600, 0], [6000, 0], [6000, 6000], [0, 6000]]] };
    const before: Design = { ...split(), walls: [...blankDesign().walls, stub], rooms: [room] };
    const next = removeWall(before, stub.id);
    expect(next.rooms.map(r => [r.id, r.name])).toEqual([['one', '大厅']]);
    expect(area(next.rooms[0]!)).toBeCloseTo(area(room) + 0.4, 3);
    expect(roundTrip(next)).toEqual(next);
  });

  it('一侧没有房间（外围墙）：合并原样返回；删墙后不再围合的房间被删除', () => {
    const before = split();
    const after = { ...before, walls: before.walls.filter(w => w.id !== 'outer-0') };
    expect(mergeRoomsAcrossWall(after, before, before.walls[0]!)).toBe(after);
    // 书房、客厅都靠着被删的外墙而开敞；原本就在墙外的房间保持原样。
    expect(removeWall(before, 'outer-0').rooms.map(r => r.id)).toEqual(['decoy']);
  });

  it('空白户型不参与合并（房间按外框重算）', () => {
    const d = blankDesign();
    expect(mergeRoomsAcrossWall(d, d, d.walls[0]!)).toBe(d);
  });
});
