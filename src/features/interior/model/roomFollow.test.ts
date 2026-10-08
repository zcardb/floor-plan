import { describe, expect, it } from 'vitest';
import { blankDesign, referenceDesign } from '../data/templates';
import { rebuildRooms } from './geometry';
import { syncRooms } from './roomFollow';
import type { Design, Point, Wall } from './types';

/** 复制/新建出来的项目：结构可编辑 */
const unlocked = (): Design => ({ ...referenceDesign(), structureUnlocked: true });
const update = (d: Design, id: string, change: (w: Wall) => Wall): Design => ({ ...d, walls: d.walls.map(w => (w.id === id ? change(w) : w)) });
const shift = (d: Design, id: string, dy: number) =>
  update(d, id, w => ({ ...w, a: [w.a[0], w.a[1] + dy] as Point, b: [w.b[0], w.b[1] + dy] as Point }));
const ringOf = (d: Design, id: string) => d.rooms.find(r => r.id === id)!.rings[0]!;
const meta = (d: Design) => d.rooms.map(r => [r.id, r.name, r.mat, r.wallMat, r.counted]);

// w44：主卧（上）与子女房（下）之间的隔墙，中心线 y=3490，厚 240
// w7：主卧上方外墙，中心线 y=-120，厚 240
describe('墙体变化后的房间跟随', () => {
  it('平移隔墙时两侧房间跟着墙面走，房间元数据与数量不变', () => {
    const before = unlocked(), next = syncRooms(before, shift(before, 'w44', 100));
    expect(ringOf(next, 'master')).toEqual([[6600, 0], [10270, 0], [10270, 3470], [6600, 3470]]);
    expect(ringOf(next, 'child')).toEqual([[6323, 3710], [10270, 3710], [10270, 6370], [6323, 6370]]);
    expect(ringOf(next, 'kid')).toEqual(ringOf(before, 'kid'));
    expect(meta(next)).toEqual(meta(before));
  });

  it('外墙加厚后房间仍贴合内侧墙面，名称与材质保留', () => {
    const before = unlocked(), next = syncRooms(before, update(before, 'w7', w => ({ ...w, thickness: 480 })));
    expect(ringOf(next, 'master')).toEqual([[6600, 120], [10270, 120], [10270, 3370], [6600, 3370]]);
    expect(ringOf(next, 'child')).toEqual(ringOf(before, 'child'));
    expect(meta(next)).toEqual(meta(before));
  });

  it('端点内缩只改墙体长度，房间划分保持稳定', () => {
    const before = unlocked(), next = syncRooms(before, update(before, 'w44', w => ({ ...w, a: [w.a[0] + 500, w.a[1]] as Point })));
    expect(next.walls.find(w => w.id === 'w44')!.a).toEqual([7100, 3490]);
    expect(ringOf(next, 'master')).toEqual(ringOf(before, 'master'));
    expect(ringOf(next, 'child')).toEqual(ringOf(before, 'child'));
  });

  it('房间翻转时拒绝整次调整', () => {
    const before = unlocked();
    expect(() => syncRooms(before, shift(before, 'w44', -3500))).toThrow('破坏房间划分');
  });

  it('房间被压平时拒绝整次调整', () => {
    const before = unlocked();
    expect(() => syncRooms(before, shift(before, 'w44', -3370))).toThrow('破坏房间划分');
  });

  it('墙体未变化时原样返回', () => {
    const before = unlocked();
    expect(syncRooms(before, before)).toBe(before);
  });

  it('空白户型仍走外框房间重算', () => {
    const partition: Wall = { id: 'p', kind: 'partition', a: [3000, 0], b: [3000, 6000], thickness: 240 };
    const base = { ...blankDesign(), walls: [...blankDesign().walls, partition] };
    expect(syncRooms(blankDesign(), base).rooms).toHaveLength(rebuildRooms(base).rooms.length);
    expect(rebuildRooms(base).rooms).toHaveLength(2);
  });
});
