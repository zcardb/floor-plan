import { describe, expect, it } from 'vitest';
import polygonClipping from 'polygon-clipping';
import { blankDesign, referenceDesign } from '../data/templates';
import { area, length, rebuildRooms, resizeBlank, ringArea } from './geometry';
import { splitWall } from './wallSplit';
import { connectedWallPoly, wallSectionPolygons } from './wallConnections';
import { validateDesign } from './validation';
import { setWallBearing, canEditWall, openingIsLocked } from './wallPolicy';
import { dimensionBinding } from './dimensionBinding';
import { dimensionEditPolicy } from './dimensionWallEdit';
import { calculateCosts } from './costs';
import { createDrawingDocument } from './drawingDocument';
import type { Design, Point, Wall } from './types';
const fixture = (a: Point = [1000, 0], b: Point = [1000, 6000]) => { const d = blankDesign(); d.walls.push({ id: 'p', kind: 'partition', thickness: 240, a, b, color: '#abcdef' }); return d; };
const footprint = (walls: Wall[]) => { const [first, ...rest] = walls.map(w => [connectedWallPoly(w, walls)]); return polygonClipping.union(first, ...rest); };
const size = (polys: ReturnType<typeof footprint>) => polys.reduce((s, p) => s + p.reduce((t, r, i) => t + (i ? -1 : 1) * Math.abs(ringArea(r as Point[])), 0), 0);
const equalShape = (a: ReturnType<typeof footprint>, b: ReturnType<typeof footprint>) => { expect(size(polygonClipping.xor(a, b))).toBeCloseTo(0, 5); };

describe('图纸墙段分割', () => {
  it.each([[[0, 0], [3000, 0]], [[3000, 0], [0, 0]], [[1000, 6000], [1000, 0]], [[100, 100], [3100, 4100]]] as [Point, Point][])('方向和精确几何保持 %j → %j', (a, b) => {
    const d = fixture(a, b), original = d.walls[d.walls.length - 1]!;
    const result = splitWall(d, 'p', [300, 800], 1), segments = result.design.walls.slice(-3);
    expect(segments[0].id).toBe('p'); expect(result.selectedId).toBe(segments[1].id);
    expect(segments[0].a).toEqual(a); expect(segments[2].b).toEqual(b);
    expect(segments[0].b).toEqual(segments[1].a); expect(segments[1].b).toEqual(segments[2].a);
    expect(segments.reduce((s, w) => s + length(w), 0)).toBeCloseTo(length(original));
    expect(result.design.rooms).toBe(d.rooms); expect(result.design.furniture).toBe(d.furniture);
    for (const s of segments) expect(s).toMatchObject({ kind: 'partition', thickness: 240, color: '#abcdef' });
    expect(d.walls[d.walls.length - 1]).toBe(original);
  });
  it('门窗完整迁移，边界允许，世界位置/开向/费用/保护不变', () => {
    const d = fixture(); d.openings = [{ id: 'door', wallId: 'p', kind: 'door', offset: 1500, width: 900, hinge: 'end', swingSide: -1, height: 2100 }];
    for (const cuts of [[1050], [1950], [1050.005, 1950.005]]) {
      const next = splitWall(d, 'p', cuts).design, o = next.openings[0], w = next.walls.find(w => w.id === o.wallId)!;
      expect(w.a[1] + o.offset).toBe(1500);
      expect(o).toMatchObject({ id: 'door', width: 900, hinge: 'end', swingSide: -1, height: 2100 });
      const marked = setWallBearing(next, w.id, true); expect(openingIsLocked(marked, w.id)).toBe(true);
      expect(calculateCosts(next)).toEqual(calculateCosts(d));
      const layers = { dims: true, labels: true, furn: true, bearing: true, grid: false, snap: true };
      expect(createDrawingDocument(next, layers).entities.filter(e => e.layer === 'OPENINGS')).toEqual(createDrawingDocument(d, layers).entities.filter(e => e.layer === 'OPENINGS'));
      expect(validateDesign(JSON.parse(JSON.stringify(next))).openings).toEqual(next.openings);
    }
  });
  it('原始与用户承重全部继承，外围根保持且整体重设拒绝', () => {
    const d = referenceDesign(), w = d.walls.find(w => w.kind === 'bearing')!;
    const next = splitWall(d, w.id, [300]).design;
    for (const segment of next.walls.filter(s => s.id === w.id || !d.walls.some(old => old.id === s.id))) {
      expect(canEditWall(next, segment)).toBe(false); expect(() => setWallBearing(next, segment.id, false)).toThrow();
    }
    const marked = setWallBearing(fixture(), 'p', true); expect(splitWall(marked, 'p', [300]).design.walls.slice(-2).every(s => s.loadBearing)).toBe(true);
    const outer = splitWall(blankDesign(), 'outer-0', [300], 1);
    const twice = splitWall(outer.design, outer.selectedId, [300]).design;
    expect(twice.walls.filter(w => w.exteriorRootId).every(w => w.exteriorRootId === 'outer-0')).toBe(true);
    expect(resizeBlank(twice, twice.width, twice.depth, twice.thickness)).toBe(twice);
    for (const params of [[twice.width + 10, twice.depth, twice.thickness], [twice.width, twice.depth + 10, twice.thickness], [twice.width, twice.depth, twice.thickness + 10]]) expect(() => resizeBlank(twice, ...params as [number, number, number])).toThrow('已分割外围墙');
    expect(validateDesign(JSON.parse(JSON.stringify(twice))).walls).toEqual(twice.walls);
    const invalid = structuredClone(twice); invalid.walls[0].exteriorRootId = ''; expect(() => validateDesign(invalid)).toThrow();
  });
  it.each([[NaN], [Infinity], [], [0], [-1], [49], [5990], [300, 300], [800, 300], [300, 340], [1, 2, 3]].map(cuts => ({ cuts })))('非法输入原子拒绝 $cuts', ({ cuts }) => {
    const d = fixture(), before = JSON.stringify(d); expect(() => splitWall(d, 'p', cuts)).toThrow(); expect(JSON.stringify(d)).toBe(before);
  });
  it('洞口内部、已拆、未知墙、无效选中及2000上限', () => {
    const d = fixture(); d.openings = [{ id: 'o', wallId: 'p', kind: 'window', offset: 1500, width: 1000 }];
    expect(() => splitWall(d, 'p', [1500])).toThrow('洞口内部'); expect(() => splitWall(d, 'missing', [300])).toThrow();
    expect(() => splitWall(d, 'p', [300], 2)).toThrow(); expect(() => splitWall({ ...d, demolished: ['p'] }, 'p', [300])).toThrow();
    d.walls.push(...Array.from({ length: 1994 }, (_, i) => ({ ...d.walls[0], id: 'extra-' + i })));
    expect(splitWall(d, 'p', [50]).design.walls).toHaveLength(2000);
    expect(() => splitWall(d, 'p', [50, 100])).toThrow('2000');
  });
  it.each([50, 100, 300])('短端部 %i mm 的 L/T 轮廓并集和3D区间不变', cut => {
    for (const branchAt of [0, 1000]) {
      const d = fixture([0, 0], [1000, 0]); d.walls = [d.walls[d.walls.length - 1]!, { id: 'branch', kind: 'partition', a: [branchAt, 0], b: [branchAt, 1000], thickness: 240 }];
      const next = splitWall(d, 'p', [cut]).design;
      equalShape(footprint(d.walls), footprint(next.walls));
      for (const w of next.walls) {
        const poly = connectedWallPoly(w, next.walls); const [first, ...rest] = wallSectionPolygons(w, poly, 0, length(w)).map(p => [p]); equalShape(polygonClipping.union([poly]), polygonClipping.union(first, ...rest));
      }
    }
    const t = fixture([0, 0], [2000, 0]); t.walls = [t.walls[t.walls.length - 1]!, { id: 'branch', kind: 'partition', a: [1000, 0], b: [1000, 1000], thickness: 240 }];
    equalShape(footprint(t.walls), footprint(splitWall(t, 'p', [1000]).design.walls));
  });
  it('重建房间、费用、净距及局部承重的固定墙带保持', () => {
    const d = rebuildRooms(fixture([3000, 0], [3000, 6000]));
    const next = splitWall(d, 'p', [50, 300]).design;
    expect(rebuildRooms(next).rooms.map(area)).toEqual(d.rooms.map(area));
    expect(calculateCosts(next)).toEqual(calculateCosts(d));
    const a = dimensionBinding(d.walls, true, 3120, d.width, 2000)!;
    const b = dimensionBinding(next.walls, true, 3120, d.width, 2000)!;
    expect(b.start).toBe(a.start); expect(b.end).toBe(a.end); expect(b.startWalls).toHaveLength(3);
    expect(dimensionEditPolicy(setWallBearing(next, 'p', true), b).reason).toBeTruthy();
  });
});
