import { describe, expect, it } from 'vitest';
import { blankDesign, referenceDesign } from '../data/templates';
import { bbox, wallPoly } from './geometry';
import { perimeterDimensions, planDrawingBounds } from './perimeterDimensions';
import type { Design, Wall } from './types';

const wall = (id: string, a: Wall['a'], b: Wall['b'], thickness = 240): Wall => ({ id, a, b, thickness, kind: 'partition' });
const fixture = (): Design => ({ ...blankDesign(), walls: [
  wall('top', [0, 0], [6000, 0]), wall('bottom', [0, 4000], [6000, 4000]),
  wall('left', [0, 0], [0, 4000]), wall('right', [6000, 0], [6000, 4000]),
] });
const lengths = (d: Design, axis: 'horizontal' | 'vertical' = 'horizontal') => perimeterDimensions(d)![axis].map(s => s.end - s.start);

describe('自动外围尺寸几何', () => {
  it('画出竖墙后产生实际两侧坐标和240mm墙厚，横墙生成Y分段', () => {
    const d = fixture();
    d.walls.push(wall('partition', [3000, 0], [3000, 4000]));
    expect(lengths(d)).toEqual([120, 120, 2760, 240, 2760, 120, 120]);
    d.walls.push(wall('horizontal', [0, 2000], [6000, 2000], 200));
    expect(lengths(d, 'vertical')).toEqual([120, 120, 1780, 200, 1780, 120, 120]);
  });
  it('移动、缩短、取消、删除、拆除与恢复均由当前墙数组决定', () => {
    const before = fixture();
    before.walls.push(wall('partition', [3000, 0], [3000, 4000]));
    const next = { ...before, walls: before.walls.map(w => w.id === 'partition' ? wall(w.id, [2000, 700], [2000, 3000]) : w) };
    expect(lengths(next)).toEqual([120, 120, 1760, 240, 3760, 120, 120]);
    expect(perimeterDimensions(next)!.vertical.some(s => s.end === 700)).toBe(true);
    expect(lengths(before)).toEqual([120, 120, 2760, 240, 2760, 120, 120]);
    expect(lengths({ ...next, demolished: ['partition'] })).toEqual(lengths(fixture()));
    expect(lengths({ ...next, walls: next.walls.filter(w => w.id !== 'partition') })).toEqual(lengths(fixture()));
    expect(lengths(JSON.parse(JSON.stringify(before)))).toEqual(lengths(before));
  });
  it('反向、重复、同坐标与容差内投影不会产生重复零段', () => {
    const d = fixture();
    const before = lengths(d);
    d.walls.push({ ...d.walls[0], id: 'reverse', a: d.walls[0].b, b: d.walls[0].a });
    d.walls.push(wall('near', [0.4, 0], [6000, 0]));
    expect(lengths(d)).toEqual(before);
    for (const axis of ['horizontal', 'vertical'] as const) {
      const chain = perimeterDimensions(d)![axis];
      expect(chain.every(s => s.end > s.start)).toBe(true);
      expect(chain.reduce((sum, s) => sum + s.end - s.start, 0)).toBeCloseTo(chain[chain.length - 1].end - chain[0].start);
    }
  });
  it('斜墙只提供整体投影范围，不把斜长或四个顶点作为分段', () => {
    const d = { ...fixture(), walls: [wall('diagonal', [-3000, -2000], [1000, 1000])] };
    const bounds = bbox(wallPoly(d.walls[0]));
    expect(lengths(d)).toEqual([bounds.x2 - bounds.x]);
    expect(lengths(d, 'vertical')).toEqual([bounds.y2 - bounds.y]);
    expect(lengths(d)[0]).not.toBe(5000);
  });
  it('无墙、退化墙及非法坐标不生成NaN尺寸', () => {
    const d = fixture();
    d.walls = [wall('zero', [0, 0], [0, 0]), wall('invalid', [NaN, 0], [1000, 0]), wall('bad-thickness', [0, 0], [1000, 0], Infinity)];
    expect(perimeterDimensions(d)).toBeNull();
    expect(perimeterDimensions({ walls: [], demolished: [] })).toBeNull();
    expect(Object.values(planDrawingBounds(d, true)).every(Number.isFinite)).toBe(true);
  });
  it('短段分配不同文字行，保留真实长度且不修改设计', () => {
    const d = { ...fixture(), walls: [wall('one', [0, 0], [1000, 0]), wall('two', [10, 0], [1010, 0])] };
    const before = JSON.stringify(d);
    const layout = perimeterDimensions(d)!;
    expect(layout.horizontal.some(s => s.end - s.start === 10)).toBe(true);
    expect(layout.horizontal.some(s => s.lane > 0)).toBe(true);
    expect(JSON.stringify(d)).toBe(before);
  });
  it('参考与旧设计均依据真实墙范围，而非固定宽度数组', () => {
    const d = referenceDesign();
    const bounds = bbox(d.walls.flatMap(w => wallPoly(w)));
    const segments = perimeterDimensions(d)!.horizontal;
    expect(segments[0].start).toBe(bounds.x);
    expect(segments[segments.length - 1].end).toBe(bounds.x2);
    expect(segments.map(s => s.end - s.start)).not.toEqual([1580, 240, 2760, 240, 1540, 240, 3670]);
  });
  it('fit/导出共享边界包含负坐标、墙轮廓及所有尺寸行；关闭后不扩展', () => {
    const d = { ...fixture(), rooms: [], walls: [wall('offset', [-7000, -8000], [-1000, -8000])] };
    const layout = perimeterDimensions(d)!;
    const shown = planDrawingBounds(d, true);
    expect(shown).toEqual(layout.bounds);
    expect(shown.x).toBeLessThan(layout.left);
    expect(shown.x2).toBeGreaterThan(layout.right);
    expect(shown.y).toBeLessThan(layout.top);
    expect(shown.y2).toBeGreaterThan(layout.bottom);
    expect(planDrawingBounds(d, false)).toEqual(bbox(wallPoly(d.walls[0])));
  });
});
