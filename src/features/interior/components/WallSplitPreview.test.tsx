import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { blankDesign } from '../data/templates';
import type { Point } from '../model/types';
vi.mock('react', async original => ({ ...await original<typeof import('react')>(), useMemo: (fn: () => unknown) => fn() }));
import { WallSplitPreview } from './WallSplitPreview';
type Node = ReactElement<Record<string, unknown>>;
function nodes(tree: ReactNode): Node[] { if (Array.isArray(tree)) return tree.flatMap(nodes); if (!isValidElement<Record<string, unknown>>(tree)) return []; return [tree, ...nodes(tree.props.children as ReactNode)]; }
const circle = (tree: Node[], key: string, value: string | number) => nodes(tree.find(n => n.props[key] === value)!).find(n => n.type === 'circle')!.props;
describe('真实朝向局部墙分割示意', () => {
  it.each([{ a: [0, 0], b: [3000, 0] }, { a: [3000, 0], b: [0, 0] }, { a: [0, 3000], b: [0, 0] }, { a: [0, 0], b: [3000, 4000] }])('A/B及切点保持方向 $a → $b', ({ a, b }) => {
    const d = blankDesign(); d.walls.push({ id: 'p', a: a as Point, b: b as Point, thickness: 240, kind: 'partition' });
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const tree = nodes(WallSplitPreview({ design: d, wallId: 'p', intervals: [0, 300, 800, L], selected: 1 }));
    const A = circle(tree, 'data-endpoint', 'A'), B = circle(tree, 'data-endpoint', 'B'), cut = circle(tree, 'data-cut', 1);
    for (const axis of ['cx', 'cy'] as const) {
      const index = axis === 'cx' ? 0 : 1;
      expect(Math.sign(Number(B[axis]) - Number(A[axis]))).toBe(Math.sign(b[index] - a[index]));
      expect(Number(cut[axis])).toBeCloseTo(Number(A[axis]) + (Number(B[axis]) - Number(A[axis])) * 300 / L);
    }
    expect(tree.some(n => n.props['data-segment'] === 2)).toBe(true);
    expect(tree.filter(n => n.props['data-cut'])).toHaveLength(2);
  });
  it('无效草稿只保留原墙、端点与邻墙，方案不变', () => {
    const d = blankDesign(), before = JSON.stringify(d);
    const tree = nodes(WallSplitPreview({ design: d, wallId: 'outer-0', intervals: [], selected: 0 }));
    expect(tree.filter(n => n.props['data-endpoint'])).toHaveLength(2);
    expect(tree.filter(n => n.props['data-cut'] || n.props['data-segment'])).toHaveLength(0);
    expect(nodes(tree.find(n => n.props.className === 'wall-split-map-context')!).length).toBeGreaterThan(1);
    expect(JSON.stringify(d)).toBe(before);
  });
  it('最短墙和50mm短段标签保持在视图内，切点标签独立于端点标签', () => {
    const d = blankDesign(); d.walls.push({ id: 'p', a: [0, 0], b: [150, 0], thickness: 240, kind: 'partition' });
    const tree = nodes(WallSplitPreview({ design: d, wallId: 'p', intervals: [0, 50, 100, 150], selected: 0 }));
    const endpointRects = tree.filter(n => n.type === 'rect' && n.props.height === 26);
    expect(endpointRects).toHaveLength(2);
    expect(Number(endpointRects[0].props.x) + 74).toBeLessThan(Number(endpointRects[1].props.x));
    for (const r of tree.filter(n => n.type === 'rect')) {
      expect(Number(r.props.x)).toBeGreaterThanOrEqual(0); expect(Number(r.props.x) + Number(r.props.width)).toBeLessThanOrEqual(360);
      expect(Number(r.props.y)).toBeGreaterThanOrEqual(0); expect(Number(r.props.y) + Number(r.props.height)).toBeLessThanOrEqual(250);
    }
  });
});
