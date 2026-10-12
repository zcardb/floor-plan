import { describe, expect, it } from 'vitest';
import { blankDesign, designForTemplate } from '../data/templates';
import { area } from './geometry';
import { syncRooms } from './roomFollow';
import { addSeparator, followSeparators, moveSeparatorBy, moveSeparatorEnd, removeSeparator, resizeSeparator, separatorEndAttached } from './separators';
import { migrateSeparators } from './roomDerive';
import { separatorEndTarget, separatorShift } from './separatorDrag';
import type { Design, Point, Separator, Wall } from './types';

const reference = () => designForTemplate('reference');
const sep = (id: string, a: Point, b: Point): Separator => ({ id, a, b });
const areaOf = (d: Design, id: string) => area(d.rooms.find(r => r.id === id)!);

describe('旧项目迁移', () => {
  it('参考户型：厨房与餐厅之间补上分隔线，两者仍是独立房间', () => {
    const legacy = reference(), next = migrateSeparators(legacy);
    expect(next.separators!.length).toBeGreaterThan(0);
    expect(next.rooms.map(r => r.name)).toEqual(legacy.rooms.map(r => r.name));
    expect(next.rooms.map(r => r.id)).toEqual(legacy.rooms.map(r => r.id));
    expect(next.rooms.map(r => r.mat)).toEqual(legacy.rooms.map(r => r.mat));
    for (const before of legacy.rooms) expect(areaOf(next, before.id)).toBeCloseTo(area(before), 0);
    // 厨房与餐厅之间：x ≈ 2180、y 5796–7400。
    const between = next.separators!.find(s => Math.abs(s.a[0] - 2180) < 60 && s.a[0] === s.b[0]);
    expect(between).toBeDefined();
  });

  it('飘窗靠分隔线与卧室分开，卧室之间不需要分隔线', () => {
    const next = migrateSeparators(reference());
    expect(next.separators!.some(s => Math.abs(s.a[0] - 10270) < 60 && Math.min(s.a[1], s.b[1]) < 1000 && Math.max(s.a[1], s.b[1]) > 2500)).toBe(true);
    const ids = new Set(next.rooms.map(r => r.id));
    expect(ids.has('bay1') && ids.has('bay2') && ids.has('master') && ids.has('child')).toBe(true);
  });

  it('已有 separators 的项目原样返回（幂等）', () => {
    const d = migrateSeparators(reference());
    expect(migrateSeparators(d)).toBe(d);
  });
});

describe('分隔线的增删', () => {
  it('画一条分隔线把房间一分为二，删掉后合并回原房间', () => {
    const d = blankDesign(), id = d.rooms[0]!.id;
    const { design, id: separatorId } = addSeparator(d, [3000, 0], [3000, 6000]);
    expect(design.rooms).toHaveLength(2);
    expect(design.rooms[0]!.id).toBe(id);
    expect(design.rooms[1]!.name).toBe('房间 2');
    const back = removeSeparator(design, separatorId);
    expect(back.rooms).toHaveLength(1);
    expect(back.rooms[0]!.id).toBe(id);
    expect(area(back.rooms[0]!)).toBeCloseTo(36, 1);
  });

  it('太短的分隔线被拒绝，删除不存在的分隔线报错', () => {
    expect(() => addSeparator(blankDesign(), [1000, 1000], [1005, 1000])).toThrow('太短');
    expect(() => removeSeparator(blankDesign(), 'nope')).toThrow('不存在');
  });

  it('分隔线不计入面积，也不影响房间外的墙', () => {
    const d = blankDesign();
    const { design } = addSeparator(d, [3000, 0], [3000, 6000]);
    const total = design.rooms.reduce((s, r) => s + area(r), 0);
    expect(total).toBeCloseTo(36, 1);
    expect(design.walls).toBe(d.walls);
  });
});

describe('调整分隔线', () => {
  const split = () => {
    const { design, id } = addSeparator(blankDesign(), [3000, 0], [3000, 6000]);
    return { design, id, rooms: design.rooms.map(r => r.id) };
  };

  it('整线沿法向平移：只取法向分量，房间面积随之改变、id 沿用', () => {
    const { design, id, rooms } = split();
    const moved = moveSeparatorBy(design, id, [1000, 777]);
    const line = moved.separators!.find(s => s.id === id)!;
    expect(line.a).toEqual([4000, 0]);
    expect(line.b).toEqual([4000, 6000]);
    expect(moved.rooms.map(r => r.id)).toEqual(rooms);
    expect(areaOf(moved, rooms[0]!) + areaOf(moved, rooms[1]!)).toBeCloseTo(36, 1);
    expect(Math.max(areaOf(moved, rooms[0]!), areaOf(moved, rooms[1]!))).toBeCloseTo(24, 1);
  });

  it('拖动端点缩短后不再封口，两间房并回一间', () => {
    const { design, id } = split();
    expect(moveSeparatorEnd(design, id, 'b', [3000, 3000]).rooms).toHaveLength(1);
  });

  it('按固定端改长度', () => {
    const { design, id } = split();
    const fromA = resizeSeparator(design, id, 2500, 'a').separators!.find(s => s.id === id)!;
    expect(fromA.a).toEqual([3000, 0]);
    expect(fromA.b).toEqual([3000, 2500]);
    const fromB = resizeSeparator(design, id, 2500, 'b').separators!.find(s => s.id === id)!;
    expect(fromB.a).toEqual([3000, 3500]);
    expect(fromB.b).toEqual([3000, 6000]);
  });

  it('太短、重叠、不存在都报错；位置不变返回原对象', () => {
    const { design, id } = split();
    expect(() => resizeSeparator(design, id, 5, 'a')).toThrow('太短');
    const withOther: Design = { ...design, separators: [...design.separators!, sep('o', [4000, 1000], [6000, 1000])] };
    expect(moveSeparatorEnd(withOther, 'o', 'a', [4500, 1000]).rooms.length).toBeGreaterThan(0);
    expect(() => resizeSeparator(design, 'nope', 1000, 'a')).toThrow('不存在');
    expect(() => moveSeparatorEnd(design, 'nope', 'a', [0, 0])).toThrow('不存在');
    expect(moveSeparatorBy(design, id, [0, 500])).toBe(design);
  });

  it('另一条分隔线共线重叠时拒绝', () => {
    const d: Design = { ...blankDesign(), separators: [sep('s', [0, 3000], [3000, 3000]), sep('t', [4000, 3000], [6000, 3000])] };
    expect(() => moveSeparatorEnd(d, 't', 'a', [2000, 3000])).toThrow('重叠');
  });

  it('贴墙的一端被识别为固定端', () => {
    const d: Design = { ...blankDesign(), separators: [sep('s', [0, 3000], [3000, 3000])] };
    expect(separatorEndAttached(d, d.separators![0]!, 'a')).toBe(true);
    expect(separatorEndAttached(d, d.separators![0]!, 'b')).toBe(false);
  });
});

describe('拖动分隔线的吸附', () => {
  // 上墙中间伸出一段竖向隔墙（x=3000，y 0–2000），分隔线接在它下面一直到底墙。
  const stub: Wall = { id: 'stub', a: [3000, 0], b: [3000, 2000], thickness: 200, kind: 'partition' };
  const design = (): Design => ({ ...blankDesign(), walls: [...blankDesign().walls, stub], separators: [sep('s', [3000, 2000], [3000, 6000])] });

  it('端点只沿自身方向移动，贴近墙端截面时吸到墙端', () => {
    const d = design();
    expect(separatorEndTarget(d, 's', 'a', [3400, 2950], 1, true, 50)).toEqual([3000, 2950]);
    expect(separatorEndTarget(d, 's', 'a', [3000, 2008], 1, true, 50)).toEqual([3000, 2000]);
    expect(separatorEndTarget(d, 's', 'a', [3000, 7000], 1, true, 50)).toBeUndefined();
  });

  it('关闭吸附时按步进取整', () => {
    expect(separatorEndTarget(design(), 's', 'a', [3000, 2008], 1, false, 50)).toEqual([3000, 2000]);
    expect(separatorEndTarget(design(), 's', 'a', [3000, 2030], 1, false, 50)).toEqual([3000, 2050]);
  });

  it('整线平移只取法向分量，并吸到隔墙两侧墙面', () => {
    const d = design();
    expect(separatorShift(d, 's', [95, 400], 1, true, 50)).toEqual([100, 0]);
    expect(separatorShift(d, 's', [-130, 0], 1, false, 50)).toEqual([-150, 0]);
  });
});

describe('分隔线跟随墙体', () => {
  it('墙端伸长时，贴着墙端的分隔线沿自身方向缩短，房间仍然分开', () => {
    const before = reference();
    const separator = before.separators!.find(s => s.a[0] === s.b[0] && Math.abs(s.a[0] - 2180) < 60)!;
    // w32：厨房与餐厅开口上方那段墙（x=2300，y 3825–5796）。
    const after: Design = { ...before, walls: before.walls.map(w => (w.id === 'w32' ? { ...w, b: [w.b[0], w.b[1] + 200] as Point } : w)) };
    const moved = followSeparators(before, after).separators!.find(s => s.id === separator.id)!;
    const top = Math.min(moved.a[1], moved.b[1]);
    expect(top).toBeCloseTo(5996, 6);
    expect(moved.a[0]).toBe(moved.b[0]);
    const next = syncRooms(before, after);
    expect(next.rooms.map(r => r.id)).toEqual(before.rooms.map(r => r.id));
  });

  it('墙被删除时分隔线保持不动', () => {
    const before = reference();
    const after: Design = { ...before, walls: before.walls.filter(w => !(w.a[1] === 3490 && w.b[1] === 3490 && w.kind !== 'bearing')) };
    expect(followSeparators(before, after).separators).toEqual(before.separators);
  });

  it('隔墙加厚时，从墙面引出的分隔线端点贴到新的墙面上', () => {
    const mid: Wall = { id: 'mid', a: [3000, 0], b: [3000, 6000], thickness: 200, kind: 'partition' };
    const before: Design = { ...blankDesign(), walls: [...blankDesign().walls, mid], separators: [sep('s', [3100, 3000], [6000, 3000])] };
    const after: Design = { ...before, walls: before.walls.map(w => (w.id === 'mid' ? { ...w, thickness: 400 } : w)) };
    const moved = followSeparators(before, after).separators![0]!;
    expect(moved.a).toEqual([3200, 3000]);
    expect(moved.b).toEqual([6000, 3000]);
  });
});
