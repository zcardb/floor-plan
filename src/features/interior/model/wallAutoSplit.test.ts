import { describe, expect, it } from 'vitest';
import { blankDesign } from '../data/templates';
import { length } from './geometry';
import { resizeBlank } from './blankFrame';
import { calculateCosts } from './costs';
import { junctionCuts, splitAtJunctions } from './wallAutoSplit';
import type { Design, Point, Wall } from './types';

const wall = (id: string, a: Point, b: Point, thickness = 240): Wall => ({ id, kind: 'partition', thickness, a, b });
/** 6 m 宿主墙（240 厚），加一段新画的墙（200 厚，便于按厚度区分两组墙段）。 */
const fixture = (drawn: [Point, Point]) => ({
  ...blankDesign(), rooms: [], openings: [],
  walls: [wall('host', [0, 0], [6000, 0]), wall('drawn', drawn[0], drawn[1], 200)],
}) as Design;
/** 指定厚度的墙段，按起点排序，用来检查分割位置。 */
const segments = (d: Design, thickness: number) => d.walls.filter(w => w.thickness === thickness)
  .map(w => [w.a, w.b] as [Point, Point]).sort((x, y) => x[0][0] - y[0][0] || x[0][1] - y[0][1]);

describe('画墙交接点默认分割', () => {
  it('端点停在已有墙身上（T 形）：宿主墙按交点切成两段，总长与费用不变', () => {
    const d = fixture([[2000, 0], [2000, 3000]]);
    expect([...junctionCuts(d, 'drawn')]).toEqual([['host', [2000]]]);
    const next = splitAtJunctions(d, 'drawn');
    expect(segments(next, 240)).toEqual([[[0, 0], [2000, 0]], [[2000, 0], [6000, 0]]]);
    expect(segments(next, 200)).toEqual([[[2000, 0], [2000, 3000]]]);
    expect(segments(next, 240).reduce((s, [a, b]) => s + length({ a, b } as Wall), 0)).toBe(6000);
    const build = (design: Design) => calculateCosts(design).hard.find(line => line.key === 'build')!.quantity;
    expect(build(next)).toBeCloseTo(build(d), 6);
  });
  it('端点停在墙面上（半个墙厚内）也算交接点', () => {
    const d = fixture([[2000, 120], [2000, 3000]]);
    expect([...junctionCuts(d, 'drawn')]).toEqual([['host', [2000]]]);
    expect(segments(splitAtJunctions(d, 'drawn'), 240)).toEqual([[[0, 0], [2000, 0]], [[2000, 0], [6000, 0]]]);
  });
  it('横穿已有墙（十字穿过）：宿主墙与新墙都在交点切成独立墙段', () => {
    const d = fixture([[3000, -1500], [3000, 1500]]);
    const next = splitAtJunctions(d, 'drawn');
    expect(segments(next, 240)).toEqual([[[0, 0], [3000, 0]], [[3000, 0], [6000, 0]]]);
    expect(segments(next, 200)).toEqual([[[3000, -1500], [3000, 0]], [[3000, 0], [3000, 1500]]]);
  });
  it('已有墙端点落在新墙身上时，新墙也按交接点切开', () => {
    const d = fixture([[1000, 0], [1000, 3000]]);
    d.walls.push(wall('side', [3000, 1000], [1000, 1000], 200));
    const next = splitAtJunctions(d, 'drawn');
    expect(segments(next, 240)).toEqual([[[0, 0], [1000, 0]], [[1000, 0], [6000, 0]]]);
    expect(segments(next, 200).filter(([a, b]) => a[0] === 1000 && b[0] === 1000))
      .toEqual([[[1000, 0], [1000, 1000]], [[1000, 1000], [1000, 3000]]]);
  });
  it('交接点落在洞口内部（距洞口边超过吸附窗口）时不分割，原设计不变', () => {
    const d = fixture([[3000, 0], [3000, 3000]]);
    d.openings = [{ id: 'win', wallId: 'host', kind: 'window', offset: 3000, width: 900 }];
    expect(junctionCuts(d, 'drawn').size).toBe(0);
    expect(splitAtJunctions(d, 'drawn')).toBe(d);
  });
  it('空白户型的外围墙是可整体重设尺寸的外框，不参与自动分割', () => {
    const base = blankDesign();
    const d = { ...base, walls: [...base.walls, wall('drawn', [1000, 0], [1000, 3000], 200)] };
    expect(junctionCuts(d, 'drawn').has('outer-0')).toBe(false);
    expect(splitAtJunctions(d, 'drawn')).toBe(d);
    // 外框仍可整体重设尺寸，不会因画墙被判成「已分割外围墙」。
    expect(resizeBlank(splitAtJunctions(d, 'drawn'), d.width + 100, d.depth, d.thickness).width).toBe(d.width + 100);
  });
  it('平行或隔开的墙不算交接，原样返回同一设计', () => {
    const d = fixture([[1000, 400], [3000, 400]]);
    expect(junctionCuts(d, 'drawn').size).toBe(0);
    expect(splitAtJunctions(d, 'drawn')).toBe(d);
    // L 形转角（新墙端点落在已有墙端部、墙身已到墙端）不产生碎段。
    const corner = { ...blankDesign(), rooms: [], openings: [], walls: [wall('host', [0, 0], [6000, 0]), wall('drawn', [120, 0], [120, 3000], 240)] } as Design;
    expect(splitAtJunctions(corner, 'drawn')).toBe(corner);
  });
});
