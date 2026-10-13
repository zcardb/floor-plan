import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { blankDesign, createProject, TEMPLATE_PRESETS } from '../data/templates';
import { NewProjectForm } from './NewProjectDialog';
import { WallLayoutPreview } from './WallLayoutPreview';

describe('空白户型自定义长宽', () => {
  it('blankDesign 按长宽生成外墙与房间', () => {
    const d = blankDesign({ width: 8000, depth: 5000 });
    expect([d.width, d.depth]).toEqual([8000, 5000]);
    expect(d.rooms[0].rings[0]).toEqual([[0, 0], [8000, 0], [8000, 5000], [0, 5000]]);
    const xs = d.walls.flatMap(w => [w.a[0], w.b[0]]), ys = d.walls.flatMap(w => [w.a[1], w.b[1]]);
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([-120, 8120]);
    expect([Math.min(...ys), Math.max(...ys)]).toEqual([-120, 5120]);
  });
  it('默认仍为 6 × 6 m；createProject 传入尺寸只作用于空白户型', () => {
    expect([blankDesign().width, blankDesign().depth]).toEqual([6000, 6000]);
    expect(createProject('blank', '新家', { width: 9000, depth: 4000 }).state).toMatchObject({ width: 9000, depth: 4000, template: 'blank' });
    const preset = TEMPLATE_PRESETS[0];
    expect(createProject(preset.id, '模板', { width: 9000, depth: 4000 }).state.width).toBe(preset.build().width);
  });
});

describe('新建项目表单', () => {
  const html = renderToStaticMarkup(createElement(NewProjectForm, { pending: false, onSubmit: () => {} }));
  it('默认选中空白户型，显示长宽输入（默认 6.00）与墙体预览、面积摘要', () => {
    expect(html).toContain('空白户型');
    expect(html).toContain('id="project-width"');
    expect(html).toContain('id="project-depth"');
    expect(html.match(/value="6.00"/g)).toHaveLength(2);
    expect(html).toContain('aria-label="空白户型墙体预览"');
    expect(html).toContain('长 6.00 m');
    expect(html).toContain('宽 6.00 m');
    expect(html).toContain('6.00 × 6.00 m · 36.00 m²');
  });
  it('名称为空时禁用提交', () => {
    expect(html).toMatch(/<button[^>]*disabled/);
  });
  it('选择模板时显示模板长宽，输入框只读不可修改，预览同步标注', () => {
    const preset = TEMPLATE_PRESETS[0], design = preset.build();
    const tpl = renderToStaticMarkup(createElement(NewProjectForm, { pending: false, onSubmit: () => {}, defaultTemplate: preset.id }));
    for (const [id, mm] of [['project-width', design.width], ['project-depth', design.depth]] as const) {
      const input = tpl.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))![0];
      expect(input).toContain(`value="${(mm / 1000).toFixed(2)}"`);
      expect(input).toMatch(/readonly/i);
      expect(input).toContain('disabled');
    }
    expect(tpl).toContain(`长 ${(design.width / 1000).toFixed(2)} m`);
    expect(tpl).toContain(`宽 ${(design.depth / 1000).toFixed(2)} m`);
    expect(tpl).toContain('模板尺寸不可修改');
  });
});

describe('户型墙体预览', () => {
  it('模板预览只画墙体，不含门窗与家具', () => {
    for (const preset of TEMPLATE_PRESETS) {
      const design = preset.build();
      const html = renderToStaticMarkup(createElement(WallLayoutPreview, { design, label: preset.name }));
      expect(html.match(/<polygon/g)).toHaveLength(design.walls.filter(w => !design.demolished.includes(w.id)).length);
      expect(html).not.toMatch(/door|window|<line|<path|<rect/);
      expect(html).not.toContain('data-dimension');
    }
  });
  it('空白户型显示长宽标注；无墙体时显示占位', () => {
    const html = renderToStaticMarkup(createElement(WallLayoutPreview, { design: blankDesign({ width: 7500, depth: 4200 }), size: { width: 7500, depth: 4200 }, label: '空白' }));
    expect(html).toContain('长 7.50 m');
    expect(html).toContain('宽 4.20 m');
    expect(renderToStaticMarkup(createElement(WallLayoutPreview, { design: { walls: [], demolished: [] }, label: '空' }))).toContain('暂无墙体');
  });
});
