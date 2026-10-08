import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EditorTooltip } from '@/components/ui/editor-tooltip';

describe('EditorTooltip', () => {
  it('正常态直接挂在按钮上，不新增包裹层，也不输出原生 title', () => {
    const html = renderToStaticMarkup(<EditorTooltip label="旋转 90°" shortcut="R" description="顺时针旋转"><button type="button" aria-label="旋转 90°">R</button></EditorTooltip>);
    expect(html.startsWith('<button')).toBe(true);
    expect(html).toContain('aria-label="旋转 90°"');
    expect(html).not.toContain('title=');
    expect(html).not.toContain('editor-tooltip-trigger');
  });

  it('禁用态加一层触发器，使禁用按钮也能悬停查看说明', () => {
    const html = renderToStaticMarkup(<EditorTooltip label="撤销" disabled><button type="button" disabled>撤销</button></EditorTooltip>);
    expect(html.startsWith('<span class="editor-tooltip-trigger"')).toBe(true);
    expect(html).toContain('<button type="button" disabled="">');
  });

  it('不依赖外层 TooltipProvider，独立渲染不报错', () => {
    expect(() => renderToStaticMarkup(<EditorTooltip label="全屏"><button type="button">全屏</button></EditorTooltip>)).not.toThrow();
  });
});
