import { describe, expect, it } from 'vitest';
import { blankDesign, referenceDesign } from '../data/templates';
import { area } from './geometry';
import { deriveRooms } from './roomDerive';
import { createSizeTransaction } from './sizeTransaction';
import { editRoomSide, normalizedOutline, roomSides } from './roomSides';
import { setWallBearing } from './wallPolicy';
import type { Design, Point, Wall } from './types';

const wall = (id: string, a: Point, b: Point, extra: Partial<Wall> = {}): Wall => ({ id, a, b, thickness: 240, kind: 'partition', ...extra });
/** 9 × 10 m 空白户型，在 x = 3000 处加一道通高隔墙，得到左右两个房间。 */
function split(): Design {
  const d = blankDesign({ width: 9000, depth: 10000 });
  d.walls.push(wall('p', [3000, 0], [3000, 10000]));
  return deriveRooms(d);
}
const leftRoom = (d: Design) => d.rooms.find(r => r.rings[0]!.every(p => p[0] <= 3000))!;

describe('房间逐边尺寸', () => {
  it('矩形房间从最上偏左起顺时针列出 4 条边', () => {
    const d = blankDesign({ width: 9000, depth: 10000 });
    const sides = roomSides(d, d.rooms[0]!.id);
    expect(sides.map(s => s.facing)).toEqual(['up', 'right', 'down', 'left']);
    expect(sides.map(s => Math.round(s.length))).toEqual([9000, 10000, 9000, 10000]);
    expect(sides[0]!.a).toEqual([0, 0]);
    // 空白户型的外围墙也可以单独移动，每条边两端都可选固定
    expect(sides.every(s => !s.reason && s.chooseSide)).toBe(true);
  });

  it('共线顶点合并为一条边，逆时针输入也统一为顺时针', () => {
    const ring: Point[] = [[0, 0], [0, 2000], [1000, 2000], [2000, 2000], [2000, 0]];
    const outline = normalizedOutline(ring);
    expect(outline).toHaveLength(4);
    expect(outline[0]).toEqual([0, 0]);
    expect(outline[1]).toEqual([2000, 0]);
  });

  it('改贴隔墙的边：隔墙移动、房间同步变化、外围墙不动', () => {
    const d = split(), room = leftRoom(d), before = JSON.stringify(d);
    const top = roomSides(d, room.id).find(s => s.facing === 'up')!;
    expect(Math.round(top.length)).toBe(2880);
    expect(top.chooseSide).toBe(true);
    expect(top.reason).toBeUndefined();
    const next = editRoomSide(d, room.id, top.index, 2500, 'start');
    expect(JSON.stringify(d)).toBe(before);
    expect(next.walls.find(w => w.id === 'p')!.a[0]).toBe(2620);
    expect(next.walls.filter(w => w.id.startsWith('outer-'))).toEqual(d.walls.filter(w => w.id.startsWith('outer-')));
    const moved = next.rooms.find(r => r.id === room.id)!;
    expect(area(moved)).toBeCloseTo(2.5 * 10, 3);
    expect(Math.round(roomSides(next, room.id).find(s => s.facing === 'up')!.length)).toBe(2500);
    // 与之相邻的另一个房间同步变宽
    const other = next.rooms.find(r => r.id !== room.id)!;
    expect(area(other)).toBeGreaterThan(area(d.rooms.find(r => r.id === other.id)!));
  });

  it('同值不产生修改；非法长度、错误的固定端被拒绝', () => {
    const d = setWallBearing(split(), 'outer-3', true), room = leftRoom(d);
    const top = roomSides(d, room.id).find(s => s.facing === 'up')!;
    expect(editRoomSide(d, room.id, top.index, top.length, 'start')).toBe(d);
    for (const v of [0, 99, NaN, Infinity, 100001]) expect(() => editRoomSide(d, room.id, top.index, v, 'start')).toThrow('0.10–100 m');
    expect(() => editRoomSide(d, room.id, top.index, 2500, 'end')).toThrow('固定');
  });

  it('改到穿过其他墙时整次拒绝', () => {
    const d = split();
    d.walls.push(wall('q', [6000, 0], [6000, 10000]));
    const designed = deriveRooms(d), room = leftRoom(designed);
    const top = roomSides(designed, room.id).find(s => s.facing === 'up')!;
    expect(() => editRoomSide(designed, room.id, top.index, 7000, 'start')).toThrow();
  });

  it('承重隔墙一侧的边列出长度并说明锁定原因', () => {
    const d = blankDesign({ width: 9000, depth: 10000 });
    d.walls.push(wall('p', [3000, 0], [3000, 10000], { loadBearing: true }));
    const designed = deriveRooms(setWallBearing(d, 'outer-3', true)), room = leftRoom(designed);
    const top = roomSides(designed, room.id).find(s => s.facing === 'up')!;
    expect(Math.round(top.length)).toBe(2880);
    expect(top.reason).toMatch('承重墙');
  });

  it('参考户型（含无解锁标记的旧项目）可以直接改边长且房间名称保留', () => {
    const d = referenceDesign();
    const candidate = d.rooms.flatMap(r => roomSides(d, r.id).map(s => ({ room: r.id, side: s })))
      .find(({ room, side }) => {
        if (side.reason) return false;
        try { editRoomSide(d, room, side.index, side.length - 100, side.fixed ?? 'start'); return true; } catch { return false; }
      });
    expect(candidate).toBeDefined();
    const { room, side } = candidate!;
    const next = editRoomSide(d, room, side.index, side.length - 100, side.fixed ?? 'start');
    expect(next.rooms.map(r => r.name)).toEqual(d.rooms.map(r => r.name));
    expect(roomSides(next, room).some(s => s.axis === side.axis && Math.abs(s.length - (side.length - 100)) < 1.5)).toBe(true);
  });

  it('L 形房间列出 6 条边', () => {
    const d = blankDesign({ width: 6000, depth: 6000 });
    d.rooms[0]!.rings = [[[0, 0], [3000, 0], [3000, 3000], [6000, 3000], [6000, 6000], [0, 6000]]];
    const sides = roomSides(d, d.rooms[0]!.id);
    expect(sides).toHaveLength(6);
    expect(sides.map(s => s.facing)).toEqual(['up', 'right', 'up', 'right', 'down', 'left']);
  });

  it('斜边只读', () => {
    const d = blankDesign({ width: 6000, depth: 6000 });
    d.rooms[0]!.rings = [[[0, 0], [4000, 0], [6000, 2000], [6000, 6000], [0, 6000]]];
    const slant = roomSides(d, d.rooms[0]!.id).find(s => s.axis === null)!;
    expect(slant.facing).toBe('slant');
    expect(slant.reason).toMatch('斜边');
  });
});

describe('房间边长与尺寸事务', () => {
  it('连续输入以原设计为基准实时预览，应用后只记一步撤销；取消恢复原设计', () => {
    let d = split();
    const original = d, room = leftRoom(d);
    const index = roomSides(d, room.id).find(s => s.facing === 'up')!.index;
    let commits = 0, undoTo: Design | null = null;
    const tx = createSizeTransaction(() => d, next => { d = next; }, (next, before) => { d = next; commits++; undoTo = before; });
    const token = tx.begin({ kind: 'room', id: room.id });
    for (const v of [2600, 2400, 2500]) tx.updateWith(token, before => editRoomSide(before, room.id, index, v, 'start'));
    expect(Math.round(roomSides(d, room.id)[index]!.length)).toBe(2500);
    expect(commits).toBe(0);
    expect(() => tx.updateWith(token, before => editRoomSide(before, room.id, index, 50, 'start'))).toThrow();
    // 非法输入不覆盖最后一次合法预览
    expect(Math.round(roomSides(d, room.id)[index]!.length)).toBe(2500);
    tx.updateWith(token, before => editRoomSide(before, room.id, index, 2500, 'start'));
    expect(tx.apply(token)).toBe(true);
    expect(commits).toBe(1);
    expect(undoTo).toBe(original);
    const again = tx.begin({ kind: 'room', id: room.id });
    tx.updateWith(again, before => editRoomSide(before, room.id, index, 2000, 'start'));
    tx.cancel(again);
    expect(Math.round(roomSides(d, room.id)[index]!.length)).toBe(2500);
    expect(commits).toBe(1);
  });
});
