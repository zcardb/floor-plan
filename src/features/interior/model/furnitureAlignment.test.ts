import { describe, expect, it } from 'vitest';
import { snapFurniture } from './furnitureAlignment';
import type { Design, Furniture } from './types';

const furn = (id: string, cx: number, cy: number, w = 1000, d = 600, rot = 0): Furniture =>
  ({ id, type: 'sofa', name: id, cx, cy, w, d, rot, color: '#ccc' });
const design = (furniture: Furniture[], walls: Design['walls'] = []) =>
  ({ walls, demolished: [], furniture }) as unknown as Design;

describe('snapFurniture 家具对齐线', () => {
  it('中线接近时吸附到对方中线并返回竖向对齐线', () => {
    const a = furn('a', 2000, 1000), moving = furn('m', 0, 0);
    const r = snapFurniture(moving, [2030, 3013], design([a, moving]), true, 100);
    expect(r.point).toEqual([2000, 3000]);
    expect(r.guides).toContainEqual({ axis: 'x', at: 2000, from: 700, to: 3300 });
    expect(r.guides.every(g => g.axis === 'x')).toBe(true);
  });
  it('超出容差不吸附，按 50mm 取整且无对齐线', () => {
    const r = snapFurniture(furn('m', 0, 0), [2130, 3013], design([furn('a', 2000, 1000)]), true, 50);
    expect(r).toEqual({ point: [2150, 3000], guides: [] });
  });
  it('关闭吸附只做 50mm 取整', () => {
    const r = snapFurniture(furn('m', 0, 0), [2030, 3013], design([furn('a', 2000, 1000)]), false, 100);
    expect(r).toEqual({ point: [2050, 3000], guides: [] });
  });
  it('不会和自身对齐', () => {
    const m = furn('m', 2000, 1000);
    expect(snapFurniture(m, [2030, 1013], design([m]), true, 100).guides).toEqual([]);
  });
  it('旋转 90° 的家具按外接矩形边对齐', () => {
    // rotated 90°: x half-extent = 300, so centre 2200 puts its right edge on a's right edge 2500
    const a = furn('a', 2000, 1000), moving = furn('m', 0, 0, 1000, 600, 90);
    const r = snapFurniture(moving, [2180, 4000], design([a, moving]), true, 50);
    expect(r.point[0]).toBe(2200); // right edge 2500 == a right edge 2500
    expect(r.guides).toContainEqual(expect.objectContaining({ axis: 'x', at: 2500 }));
  });
  it('墙边更近时选墙体，不显示家具对齐线', () => {
    const wall = { id: 'w', a: [3000, -5000], b: [3000, 5000], thickness: 200, kind: 'partition' } as Design['walls'][number];
    // wall left face x=2900 → centre 2400 (dist 10); furniture centre 2000 is 410 away
    const r = snapFurniture(furn('m', 0, 0), [2390, 3013], design([furn('a', 2000, 1000)], [wall]), true, 100);
    expect(r.point[0]).toBe(2400);
    expect(r.guides.filter(g => g.axis === 'x')).toEqual([]);
  });
  it('三件共线时对齐线覆盖全部家具', () => {
    const r = snapFurniture(furn('m', 0, 0), [2020, 5000], design([furn('a', 2000, 1000), furn('b', 2000, 3000)]), true, 100);
    expect(r.guides).toContainEqual({ axis: 'x', at: 2000, from: 700, to: 5300 });
  });
});
