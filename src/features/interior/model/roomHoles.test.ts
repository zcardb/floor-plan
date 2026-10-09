import { describe, expect, it } from 'vitest';
import { blankDesign } from '../data/templates';
import { area } from './geometry';
import { isStrayHole, stripStrayHoles } from './roomHoles';
import type { Design, Point, Room } from './types';

/** 用户方案「院子」的真实外轮廓与残留碎洞（删掉院子与楼梯间之间的墙后留下的 120×350 mm 墙带）。 */
const courtyard: Point[] = [[0, 3260], [10000, 3260], [10000, 5660], [7140, 5660], [7140, 13000], [0, 13000]];
const stray: Point[] = [[6740, 5260], [6740, 5610], [6860, 5610], [6860, 5260]];
const ring = (x: number, y: number, w: number, h: number): Point[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const plan = (holes: Point[][] = []): Design => ({
  ...blankDesign(),
  template: 'reference',
  rooms: [{ id: 'r-7', name: '院子', mat: 'wood', rings: [courtyard, ...holes] }] as Room[],
});
const courtyardRoom = (d: Design) => d.rooms[0]!;

describe('房间轮廓里的墙垛碎洞', () => {
  it('院子里的 120×350 碎洞被清掉，面积从 76.37 回到 76.41 m²', () => {
    const before = plan([stray]);
    expect(area(courtyardRoom(before))).toBeCloseTo(76.37, 2);
    const next = stripStrayHoles(before);
    expect(courtyardRoom(next).rings).toHaveLength(1);
    expect(courtyardRoom(next).rings[0]).toEqual(courtyard);
    expect(area(courtyardRoom(next))).toBeCloseTo(76.4076, 3);
  });
  it('柱位与井道这类真实空洞保留：240×240 柱、1200×1200 井道、短边 300 的窄洞', () => {
    const d = plan([ring(1000, 4000, 240, 240), ring(3000, 6000, 1200, 1200), ring(5000, 4000, 300, 800)]);
    expect(stripStrayHoles(d)).toBe(d);
  });
  it('墙厚 240 的项目里 240 宽的残块同样算碎块，方正的 240×240 柱位不算', () => {
    expect(isStrayHole(ring(2000, 4000, 240, 1200), 240)).toBe(true);
    expect(isStrayHole(ring(2000, 4000, 240, 240), 240)).toBe(false);
    const d = plan([ring(2000, 4000, 240, 1200)]);
    expect(stripStrayHoles(d).rooms[0]!.rings).toHaveLength(1);
  });
  it('没有碎洞时不改动对象，清理幂等', () => {
    const clean = plan([ring(1000, 4000, 240, 240)]);
    expect(stripStrayHoles(clean)).toBe(clean);
    const once = stripStrayHoles(plan([stray]));
    expect(stripStrayHoles(once)).toBe(once);
  });
});
