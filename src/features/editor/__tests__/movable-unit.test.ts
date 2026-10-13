import { describe, expect, it } from 'vitest';
import { dragUnit, rotateUnit, unitBox } from '../model/movable-unit';
import type { Design, Furniture } from '@/lib/floor-plan/types';

const furn = (id: string, cx: number, cy: number, w = 400, d = 400, rot = 0): Furniture =>
  ({ id, type: 'chair', name: id, cx, cy, w, d, rot, color: '#888' });
const design = (furniture: Furniture[], walls: Design['walls'] = []) =>
  ({ walls, demolished: [], furniture, dragStep: 50 }) as unknown as Design;
const wall = (x: number): Design['walls'][number] =>
  ({ id: 'w', a: [x, -5000], b: [x, 5000], thickness: 200, kind: 'partition' }) as Design['walls'][number];
const pos = (d: Design) => d.furniture.map(f => [f.id, f.cx, f.cy, f.rot]);

describe('可移动单位', () => {
  it('单件就是家具本身，整组是外接框', () => {
    const d = design([furn('a', 1000, 1000), furn('b', 2000, 1000)]);
    expect(unitBox(d, ['a'])).toBe(d.furniture[0]);
    expect(unitBox(d, ['a', 'b'])).toMatchObject({ cx: 1500, cy: 1000, w: 1400, d: 400, rot: 0 });
    expect(unitBox(d, ['gone', 'gone2'])).toBeNull();
  });

  it('整组拖动吸附到组外家具并给出对齐线，组内相对位置不变', () => {
    const d = design([furn('a', 1000, 1000), furn('b', 2000, 1000), furn('c', 1530, 3000)]);
    // 组中心 1500 → 拖 +20 后接近 c 的中线 1530，吸附过去。
    const r = dragUnit(d, d, ['a', 'b'], [20, 0], true, 100);
    const [a, b] = r.design.furniture;
    expect(b!.cx - a!.cx).toBe(1000);
    expect((a!.cx + b!.cx) / 2).toBe(1530);
    expect(r.guides).toContainEqual(expect.objectContaining({ axis: 'x', at: 1530 }));
  });

  it('整组不吸附组内成员，关闭吸附只按步进移动', () => {
    const d = design([furn('a', 1000, 1000), furn('b', 2000, 1000)]);
    const r = dragUnit(d, d, ['a', 'b'], [130, 0], false, 100);
    expect(r.guides).toEqual([]);
    expect(pos(r.design)).toEqual([['a', 1150, 1000, 0], ['b', 2150, 1000, 0]]);
  });

  it('整组不会嵌进墙里：碰到墙停在墙面', () => {
    // 墙左面 x=2900；组右边缘 2200，最多右移 700。
    const d = design([furn('a', 1000, 1000), furn('b', 2000, 1000)], [wall(3000)]);
    const r = dragUnit(d, d, ['a', 'b'], [1500, 0], false, 10);
    expect(r.design.furniture[1]!.cx + 200).toBe(2900);
    expect(r.design.furniture[1]!.cx - r.design.furniture[0]!.cx).toBe(1000);
  });

  it('单件拖动与整组走同一逻辑', () => {
    const d = design([furn('a', 1000, 1000), furn('c', 1530, 3000)]);
    const r = dragUnit(d, d, ['a'], [520, 0], true, 100);
    expect(r.design.furniture[0]!.cx).toBe(1530);
    expect(r.guides.length).toBeGreaterThan(0);
  });

  it('整组绕整体中心旋转 90°，各件朝向同步旋转；组外不动', () => {
    const d = design([furn('a', 1000, 1000), furn('b', 2000, 1000, 400, 400, 90), furn('c', 5000, 5000)]);
    const next = rotateUnit(d, ['a', 'b'], 90);
    expect(pos(next)).toEqual([['a', 1500, 500, 90], ['b', 1500, 1500, 180], ['c', 5000, 5000, 0]]);
    // 转四次回到原位。
    let back = next;
    for (let i = 0; i < 3; i++) back = rotateUnit(back, ['a', 'b'], 90);
    expect(pos(back)).toEqual(pos(d));
  });

  it('单件旋转即原地转', () => {
    const d = design([furn('a', 1000, 1000, 600, 400, 350)]);
    expect(pos(rotateUnit(d, ['a'], 90))).toEqual([['a', 1000, 1000, 80]]);
  });
});
