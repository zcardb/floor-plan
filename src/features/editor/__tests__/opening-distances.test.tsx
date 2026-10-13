import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { OpeningDistances } from '../components/opening-distances';
import { blankDesign } from '@/lib/floor-plan/templates';
import { dragOpening } from '../model/opening-drag';
import type { Design, Opening, Point } from '@/lib/floor-plan/types';

const fixture = (kind: Opening['kind'], a: Point = [0, 0], b: Point = [6000, 0]) => ({ ...blankDesign(),
  walls: [{ id: 'wall', a, b, thickness: 200, kind: 'partition' as const }],
  openings: [{ id: 'opening', wallId: 'wall', kind, width: 1000, offset: 2000 }],
});
const render = (design: Design = fixture('door'), scale = 0.05) => renderToStaticMarkup(createElement(OpeningDistances, { design, openingId: 'opening', scale }));
describe('门窗两侧净距', () => {
  it.each(['door', 'window'] as const)('%s 从洞口边缘计算并跟随实际预览', kind => {
    const d = fixture(kind);
    expect(render(d)).toContain('1.50 m'); expect(render(d)).toContain('3.50 m');
    const next = dragOpening(d, 'opening', [2000, 0], [3000, 0])!;
    expect(render(next).match(/2.50 m/g)).toHaveLength(2);
    expect(render(d)).toContain('1.50 m');
  });
  it('任意墙方向和缩放不改变距离，贴端显示零', () => {
    for (const [a, b] of [[[0, 0], [0, 6000]], [[6000, 0], [0, 0]], [[0, 0], [3600, 4800]]] as [Point, Point][]) {
      for (const scale of [0.012, 0.05, 1]) {
        const d = fixture('window', a, b);
        expect(render(d, scale)).toContain('1.50 m'); expect(render(d, scale)).toContain('3.50 m');
        d.openings[0].offset = 500;
        expect(render(d, scale)).toContain('0.00 m');
      }
    }
  });
  it('缺失对象不展示，标注不拦截指针也不进入导出', () => {
    const d = fixture('door');
    expect(render({ ...d, openings: [] })).toBe('');
    expect(render({ ...d, walls: [] })).toBe('');
    expect(render(d)).toContain('pointer-events="none"');
    expect(render(d)).toContain('data-export-hide="true"');
  });
  it('重叠拒绝保留最后有效距离', () => {
    const d = fixture('door'); d.openings.push({ ...d.openings[0], id: 'neighbor', offset: 4000 });
    const valid = dragOpening(d, 'opening', [2000, 0], [2800, 0])!;
    expect(dragOpening(d, 'opening', [2000, 0], [3500, 0])).toBeNull();
    expect(render(valid)).toContain('2.30 m'); expect(render(valid)).toContain('2.70 m');
  });
});
