import { describe, expect, it } from 'vitest';
import polygonClipping from 'polygon-clipping';
import { connectedWallPoly, wallSectionPolygons } from '../wall-connections';
import { wallPoly, ringArea } from '../geometry';
import type { Wall } from '../types';
const wall = (id: string, a: Wall['a'], b: Wall['b'], thickness = 200): Wall => ({ id, a, b, thickness, kind: 'partition' });
describe('默认墙连接收口', () => {
  it('等厚 L 形共享斜接面，外角补齐且内角不突出', () => {
    const a = wall('a', [0, 0], [1000, 0]), b = wall('b', [1000, 0], [1000, 1000]);
    expect(connectedWallPoly(a, [a, b])).toEqual([[0, 100], [900, 100], [1100, -100], [0, -100]]);
    expect(connectedWallPoly(b, [a, b])).toEqual([[900, 100], [900, 1000], [1100, 1000], [1100, -100]]);
    expect(polygonClipping.intersection([connectedWallPoly(a, [a, b])], [connectedWallPoly(b, [a, b])])).toEqual([]);
  });
  it('不同厚度 L 形按各自墙面连接，反向端点不改变轮廓面积', () => {
    const a = wall('a', [0, 0], [1000, 0]), b = wall('b', [1000, 0], [1000, 1000], 300);
    const poly = connectedWallPoly(a, [a, b]);
    expect(poly).toContainEqual([850, 100]); expect(poly).toContainEqual([1150, -100]);
    const reversed = { ...a, a: a.b, b: a.a };
    expect(ringArea(connectedWallPoly(reversed, [reversed, b]))).toBeCloseTo(ringArea(poly));
  });
  it('T 形支墙平齐宿主近侧墙面，宿主不受影响', () => {
    const host = wall('host', [0, 0], [2000, 0], 300), branch = wall('branch', [1000, 0], [1000, 1000]);
    expect(connectedWallPoly(branch, [host, branch])).toEqual([[900, 150], [900, 1000], [1100, 1000], [1100, 150]]);
    expect(connectedWallPoly(host, [host, branch])).toEqual(wallPoly(host));
  });
  it('直线续接、独立墙、已拆邻墙保持平口，旧坐标不变', () => {
    const a = wall('a', [0, 0], [1000, 0]), b = wall('b', [1000, 0], [2000, 0]);
    const snapshot = JSON.stringify([a, b]);
    expect(connectedWallPoly(a, [a, b])).toEqual(wallPoly(a));
    expect(connectedWallPoly(a, [a])).toEqual(wallPoly(a));
    expect(connectedWallPoly(a, [a, wall('c', [1000, 0], [1000, 1000])], ['c'])).toEqual(wallPoly(a));
    expect(JSON.stringify([a, b])).toBe(snapshot);
  });
  it('近乎平行和短墙不生成尖刺或非有限坐标', () => {
    for (const end of [[0, 1], [995, 20]] as Wall['b'][]) {
      const a = wall('a', [0, 0], [1000, 0]), b = wall('b', [1000, 0], end);
      const poly = connectedWallPoly(a, [a, b]);
      expect(poly.flat().every(Number.isFinite)).toBe(true);
      expect(poly.every(p => p[0] >= -400 && p[0] <= 1400)).toBe(true);
    }
  });
  it('三维分段只在首末段保留收口，中间门窗区间精确裁切', () => {
    const a = wall('a', [0, 0], [1000, 0]), b = wall('b', [1000, 0], [1000, 1000]);
    const poly = connectedWallPoly(a, [a, b]);
    const first = wallSectionPolygons(a, poly, 0, 300).flat(), last = wallSectionPolygons(a, poly, 700, 1000).flat();
    expect(Math.max(...first.map(p => p[0]))).toBe(300);
    expect(Math.min(...last.map(p => p[0]))).toBe(700);
    expect(Math.max(...last.map(p => p[0]))).toBe(1100);
    const opening = wallSectionPolygons(a, poly, 300, 700).flat();
    expect(Math.min(...opening.map(p => p[0]))).toBe(300);
    expect(Math.max(...opening.map(p => p[0]))).toBe(700);
    expect(wallSectionPolygons(a, poly, 300, 300)).toEqual([]);
  });
});
