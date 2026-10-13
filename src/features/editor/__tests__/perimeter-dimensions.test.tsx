import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { blankDesign } from '@/lib/floor-plan/templates';
import { perimeterDimensions } from '@/lib/floor-plan/perimeter-dimensions';
import { PerimeterDimensions } from '../components/perimeter-dimensions';

function markup(x = 3000) {
  const d = blankDesign();
  d.walls.push({ id: 'partition', a: [x, 0], b: [x, d.depth], thickness: 240, kind: 'partition' });
  return renderToStaticMarkup(<svg><PerimeterDimensions layout={perimeterDimensions(d)} /></svg>);
}
describe('外围尺寸SVG', () => {
  it('显示四边真实米数、墙厚、斜刻度且不抢占墙体鼠标事件', () => {
    const svg = markup();
    expect(svg).toContain('pointer-events="none"');
    expect(svg.match(/data-dimension-axis="x"/g)).toHaveLength(4);
    expect(svg.match(/data-dimension-axis="y"/g)).toHaveLength(4);
    expect(svg).toContain('data-dimension-length="240"');
    expect(svg).toContain('0.24 m');
    expect(svg).toContain('<path');
    expect(svg).toContain('rotate(-90');
    expect(svg).not.toContain('data-export-hide');
  });
  it('新墙位置更新标签，恢复原位置还原SVG，不需要保存标注对象', () => {
    const original = markup();
    expect(markup(2000)).not.toBe(original);
    expect(markup()).toBe(original);
  });
  it('无有效墙时不渲染外围标注', () => {
    expect(renderToStaticMarkup(<svg><PerimeterDimensions layout={null} /></svg>)).toBe('<svg></svg>');
  });
});
