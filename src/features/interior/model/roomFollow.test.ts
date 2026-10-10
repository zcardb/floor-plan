import { describe, expect, it } from 'vitest';
import { blankDesign, designForTemplate } from '../data/templates';
import { area, rebuildRooms } from './geometry';
import { syncRooms } from './roomFollow';
import type { Design, Point, Wall } from './types';

const reference = (): Design => designForTemplate('reference');
const update = (d: Design, id: string, change: (w: Wall) => Wall): Design => ({ ...d, walls: d.walls.map(w => (w.id === id ? change(w) : w)) });
const shift = (d: Design, id: string, dy: number) =>
  update(d, id, w => ({ ...w, a: [w.a[0], w.a[1] + dy] as Point, b: [w.b[0], w.b[1] + dy] as Point }));
const room = (d: Design, id: string) => d.rooms.find(r => r.id === id)!;
const box = (d: Design, id: string) => {
  const ring = room(d, id).rings[0]!;
  return [Math.min(...ring.map(p => p[0])), Math.min(...ring.map(p => p[1])), Math.max(...ring.map(p => p[0])), Math.max(...ring.map(p => p[1]))];
};
const meta = (d: Design) => d.rooms.map(r => [r.id, r.name, r.mat, r.wallMat, r.counted]);

/** 主卧（上）与子女房（下）之间、中心线 y=3490 且经过 x=8000 的那段墙。 */
const between = (d: Design) => d.walls.find(w => w.a[1] === 3490 && w.b[1] === 3490 && Math.min(w.a[0], w.b[0]) < 8000 && Math.max(w.a[0], w.b[0]) > 8000)!;
const spanOf = (w: Wall) => Math.min(Math.max(w.a[0], w.b[0]), 10270) - Math.max(Math.min(w.a[0], w.b[0]), 6600);
describe('墙体变化后房间按「墙 + 分隔线」重算', () => {
  it('平移隔墙时两侧房间跟着墙面走，房间元数据与数量不变', () => {
    const before = reference(), wall = between(before), next = syncRooms(before, shift(before, wall.id, 100));
    expect(box(next, 'master')[3]).toBeCloseTo(3470);
    // 墙下移 100 mm：主卧多出、子女房少掉同样一条 100 mm 宽的带子。
    const strip = (spanOf(wall) * 100) / 1e6;
    expect(area(room(before, 'child')) - area(room(next, 'child'))).toBeCloseTo(strip, 1);
    expect(area(room(next, 'master')) - area(room(before, 'master'))).toBeCloseTo(strip, 1);
    expect(room(next, 'kid').rings).toEqual(room(before, 'kid').rings);
    expect(meta(next)).toEqual(meta(before));
  });

  it('移动墙体时飘窗仍是独立房间，轮廓不变形', () => {
    const before = reference(), next = syncRooms(before, shift(before, between(before).id, 100));
    expect(room(next, 'bay1').rings).toEqual(room(before, 'bay1').rings);
    expect(room(next, 'bay2').rings).toEqual(room(before, 'bay2').rings);
  });

  it('隔墙越过对面墙时不报错，被挤掉的房间消失、其余照常', () => {
    const before = reference();
    const next = syncRooms(before, shift(before, between(before).id, -3500));
    expect(next.rooms.length).toBeGreaterThan(0);
    expect(next.rooms.every(r => area(r) >= 0.3)).toBe(true);
  });

  it('墙体未变化时原样返回', () => {
    const before = reference();
    expect(syncRooms(before, before)).toBe(before);
  });

  it('空白户型加隔墙后拆成两间', () => {
    const partition: Wall = { id: 'p', kind: 'partition', a: [3000, 0], b: [3000, 6000], thickness: 240 };
    const base = { ...blankDesign(), walls: [...blankDesign().walls, partition] };
    expect(syncRooms(blankDesign(), base).rooms).toHaveLength(2);
    expect(rebuildRooms(base).rooms).toHaveLength(2);
  });
});

describe('新增墙体时切分房间', () => {
  it('横穿主卧的墙把主卧切成两块，原房间属性保留在大块上', () => {
    const before = reference();
    const wall: Wall = { id: 'drawn', kind: 'partition', a: [9000, 0], b: [9000, 3370], thickness: 120 };
    const next = syncRooms(before, { ...before, walls: [...before.walls, wall] });
    expect(next.rooms).toHaveLength(before.rooms.length + 1);
    const master = room(before, 'master'), kept = room(next, 'master');
    expect([kept.name, kept.mat, kept.wallMat, kept.counted]).toEqual([master.name, master.mat, master.wallMat, master.counted]);
    const added = next.rooms[next.rooms.length - 1]!;
    expect(added.name).toBe('主卧室 2');
    expect(added.mat).toBe(master.mat);
    expect(area(kept) + area(added) + 0.12 * 3.37).toBeCloseTo(area(master), 1);
  });
});
