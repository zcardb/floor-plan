import { describe, expect, it } from 'vitest';
import { blankDesign, referenceDesign } from '../data/templates';
import { rebuildRooms, rect } from './geometry';
import { removeRoom, roomOwnWalls } from './roomRemoval';
import { openRoomIds } from './roomEnclosure';
import { setWallBearing } from './wallPolicy';
import { validateDesign } from './validation';
import type { Design, Furniture, Wall } from './types';

const sofa = (id: string, cx: number, cy: number): Furniture => ({ id, type: 'sofa', name: '沙发', cx, cy, w: 800, d: 600, rot: 0, color: '#aa8866' });
/** 6 m × 6 m 外框（四面整墙）+ x = 2500 的隔墙：左书房、右客厅。 */
const partition: Wall = { id: 'inner', kind: 'partition', a: [2500, 0], b: [2500, 6000], thickness: 200 };
const two = (): Design => ({
  ...blankDesign(),
  template: 'reference',
  walls: [...blankDesign().walls, partition],
  rooms: [
    { id: 'small', name: '书房', mat: 'wood', rings: [rect(0, 0, 2400, 6000)] },
    { id: 'big', name: '客厅', mat: 'wood', rings: [rect(2600, 0, 3400, 6000)] },
  ],
  furniture: [sofa('in-small', 1200, 3000), sofa('in-big', 4000, 3000)],
});

describe('删除房间', () => {
  it('共用隔墙不算独立墙；整面外墙跨两间房时也不算整面独立', () => {
    const d = two();
    expect(roomOwnWalls(d, 'small')).not.toContain('inner');
    // 左外墙只围着书房。
    const left = d.walls.find(w => w.a[0] === w.b[0] && w.a[0] < 500)!;
    expect(roomOwnWalls(d, 'small')).toContain(left.id);
  });
  it('只删本房间的墙段：跨房间的外墙切开后删掉本房间那段，共用隔墙与另一间保留', () => {
    const before = two();
    const result = removeRoom(before, 'small');
    const next = result.design;
    expect(next.rooms.map(r => r.id)).toEqual(['big']);
    expect(next.walls.some(w => w.id === 'inner')).toBe(true);
    expect(next.furniture.map(f => f.id)).toEqual(['in-big']);
    expect(result.furniture).toBe(1);
    expect(result.removedWalls).toBe(3);
    // 剩下的客厅仍被墙围合，没有墙段伸进被删房间的区域。
    expect(openRoomIds(next).has('big')).toBe(false);
    expect(next.walls.every(w => Math.min(w.a[0], w.b[0]) >= 2300)).toBe(true);
    expect(before.rooms).toHaveLength(2);
  });
  it('墙上的门窗随墙删除，共用墙上的门窗保留', () => {
    const d = two();
    const left = d.walls.find(w => w.a[0] === w.b[0] && w.a[0] < 500)!;
    d.openings.push({ id: 'win', wallId: left.id, kind: 'window', offset: 3000, width: 1200 });
    d.openings.push({ id: 'door', wallId: 'inner', kind: 'door', offset: 3000, width: 900 });
    const next = removeRoom(d, 'small').design;
    expect(next.openings.map(o => o.id)).toEqual(['door']);
  });
  it('空白户型删除一间：只留下共用隔墙与另一间的墙', () => {
    const d = rebuildRooms({ ...blankDesign(), walls: [...blankDesign().walls, { ...partition, a: [3000, 0], b: [3000, 6000] }] });
    const left = d.rooms.find(r => r.rings[0]!.every(p => p[0] <= 3000))!;
    const next = removeRoom(d, left.id).design;
    expect(next.rooms).toHaveLength(1);
    expect(next.walls.some(w => w.id === 'inner')).toBe(true);
    expect(next.walls.every(w => Math.min(w.a[0], w.b[0]) >= 2900)).toBe(true);
  });
  it('独立墙为承重墙时保留并拒绝删除，设计不变', () => {
    let d = two();
    for (const w of roomOwnWalls(d, 'small')) d = setWallBearing(d, w, true);
    const top = d.walls.find(w => w.a[1] === w.b[1] && w.a[1] < 500)!;
    d = setWallBearing(d, top.id, true);
    const bottom = d.walls.find(w => w.a[1] === w.b[1] && w.a[1] > 5500)!;
    d = setWallBearing(d, bottom.id, true);
    expect(() => removeRoom(d, 'small')).toThrow(/承重/);
  });
  it('只剩一个房间时不能删除', () => {
    const d = { ...two(), rooms: [two().rooms[0]!] };
    expect(() => removeRoom(d, 'small')).toThrow('至少保留一个房间');
  });
  it('参考户型：可删的房间只少这一间，其余房间保留；全是共用墙 / 承重墙的房间整次拒绝', () => {
    const d = referenceDesign();
    let done = 0;
    for (const room of d.rooms) {
      try {
        const result = removeRoom(d, room.id);
        expect(result.design.rooms.map(r => r.id)).toEqual(d.rooms.filter(r => r.id !== room.id).map(r => r.id));
        expect(result.removedWalls).toBeGreaterThan(0);
        expect(validateDesign(JSON.parse(JSON.stringify(result.design)))).toBeTruthy();
        done++;
      } catch (e) {
        expect((e as Error).message).toMatch(/共用墙|承重|围合/);
      }
    }
    expect(done).toBeGreaterThan(5);
  });
});
