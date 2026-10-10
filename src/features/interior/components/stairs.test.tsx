import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { library } from '../data/catalog';
import { blankDesign } from '../data/templates';
import { validateDesign } from '../model/validation';
import { createSizeTransaction } from '../model/sizeTransaction';
import { STAIR_PRESETS, applyStairForm, stairFlightWidths, stairLayout, stairMetrics, stairSpec } from '../model/stairs';
import { furnitureDrawing } from '../model/furnitureDrawing';
import { FurnitureShape } from './FurnitureShape';
import { SizeFields } from './SizeFields';
import { StairEditor } from './StairEditor';
import { sizeDraftToModel } from '../model/lengthUnits';
import type { Design, Furniture } from '../model/types';

/** 旧数据里的楼梯：没有 stair 字段。 */
const legacy: Furniture = { id: 'stairs', type: 'stairs', name: '楼梯', catalogId: 'stairs:楼梯', w: 1000, d: 3000, cx: 2000, cy: 2000, rot: 0, color: '#e6dccc' };
const preset = (name: string) => library.find(item => item.name === name)!;
const markupOf = (f: Pick<Furniture, 'type' | 'w' | 'd' | 'color' | 'stair'>) => renderToStaticMarkup(<svg><FurnitureShape f={f} /></svg>);
const count = (markup: string, tag: string) => (markup.match(new RegExp(`<${tag} `, 'g')) || []).length;

describe('楼梯类别与平面图样', () => {
  it('素材库提供直跑 / L 型 / U 型 / 三跑 / 螺旋五种楼梯，均带参数', () => {
    expect(library.filter(item => item.type === 'stairs').map(item => item.stair?.form)).toEqual(['straight', 'l', 'u', 'triple', 'spiral']);
    expect(preset('直跑楼梯')).toMatchObject({ w: 1000, d: 3600, stair: { form: 'straight', flightWidth: 1000, steps: 14 } });
  });
  it('旧楼梯没有 stair 字段时按直跑 12 级绘制，仍是 11 条踏步线', () => {
    expect(stairSpec(legacy)).toEqual({ form: 'straight', flightWidth: 1000, steps: 12 });
    const markup = markupOf(legacy);
    expect(markup).toContain('width="1000"');
    expect(markup).toContain('height="3000"');
    expect(count(markup, 'line')).toBe(11);
  });
  it('每类都有行走线箭头、起步点、「上」字与折断线；踏步线随踏步数变化', () => {
    for (const item of library.filter(i => i.type === 'stairs')) {
      const markup = markupOf(item);
      expect(markup, item.name).toContain(`data-stair-form="${item.stair!.form}"`);
      expect(markup, item.name).toContain('>上</text>');
      expect(count(markup, 'path'), item.name).toBeGreaterThanOrEqual(3);
      expect(markup, item.name).not.toContain('NaN');
    }
    const straight = preset('直跑楼梯');
    expect(count(markupOf(straight), 'line')).toBe(13);
    expect(count(markupOf({ ...straight, stair: { ...straight.stair!, steps: 18 } }), 'line')).toBe(17);
    const spiral = markupOf(preset('螺旋楼梯'));
    expect(count(spiral, 'circle')).toBe(3);
    expect(count(spiral, 'line')).toBe(15);
  });
  it('边界：外框缩小时梯段宽被夹取，几何不出现负尺寸或 NaN', () => {
    for (const p of STAIR_PRESETS) for (const [w, d] of [[1000, 1000], [600, 2400], [2400, 600]]) {
      const layout = stairLayout({ form: p.form, flightWidth: 1200, steps: 40 }, w, d);
      expect(layout.flightWidth, p.form).toBeGreaterThan(0);
      expect(layout.flightWidth, p.form).toBeLessThanOrEqual(p.form === 'straight' ? w : Math.min(w, d));
      expect(layout.treadDepth, p.form).toBeGreaterThan(0);
      expect([...layout.lines.flat(), ...layout.walk, ...layout.arrow, ...layout.breakLine, layout.label].flat().every(Number.isFinite), p.form).toBe(true);
    }
  });
  it('导出时楼梯含「上」字文本，螺旋楼梯外圆与中柱导出为圆', () => {
    const straight = furnitureDrawing({ ...preset('直跑楼梯'), id: 's', cx: 0, cy: 0, rot: 30 });
    expect(straight.some(e => e.kind === 'text' && e.layer === 'STAIRS' && e.text === '上' && Math.abs(e.rotation - 30) < 1e-6)).toBe(true);
    // 旋转 180° 后导出文字翻正（GB/T 50001：从下方或右侧阅读）。
    const flipped = furnitureDrawing({ ...preset('直跑楼梯'), id: 'f', cx: 0, cy: 0, rot: 180 });
    expect(flipped.find(e => e.kind === 'text')).toMatchObject({ rotation: 0 });
    const spiral = furnitureDrawing({ ...preset('螺旋楼梯'), id: 'p', cx: 0, cy: 0, rot: 0 });
    expect(spiral.filter(e => e.kind === 'circle')).toHaveLength(3);
  });
  it('行走方向反转：起步点与箭头对调，踏步线不变', () => {
    const spec = { form: 'straight' as const, flightWidth: 1000, steps: 14 };
    const forward = stairLayout(spec, 1000, 3600), reversed = stairLayout({ ...spec, reverse: true }, 1000, 3600);
    expect(forward.start[1]).toBeGreaterThan(0);
    expect(reversed.start[1]).toBeLessThan(0);
    expect(reversed.arrow[1][1]).toBeGreaterThan(0);
    expect(reversed.label[1]).toBeLessThan(0);
    expect(reversed.lines).toEqual(forward.lines);
    const spiral = { form: 'spiral' as const, flightWidth: 800, steps: 14 }, walk = stairLayout(spiral, 1800, 1800).walk;
    expect(stairLayout({ ...spiral, reverse: true }, 1800, 1800).start).toEqual(walk[walk.length - 1]);
  });
  it('左转：L / U / 三跑左右镜像，「上」字不做镜像变换', () => {
    for (const form of ['l', 'u', 'triple'] as const) {
      const p = STAIR_PRESETS.find(s => s.form === form)!, spec = { form, flightWidth: p.flightWidth, steps: p.steps };
      const right = stairLayout(spec, p.w, p.d), left = stairLayout({ ...spec, hand: 'left' }, p.w, p.d);
      expect(left.lines.map(([a, b]) => [[-a[0], a[1]], [-b[0], b[1]]])).toEqual(right.lines);
      expect(left.start[0]).toBeCloseTo(-right.start[0]);
      expect(left.start[0], form).toBeGreaterThan(0);
    }
    const markup = markupOf({ ...preset('L 型楼梯'), stair: { ...preset('L 型楼梯').stair!, hand: 'left' } });
    expect(markup).not.toMatch(/<text[^>]*transform/);
    expect(stairLayout({ form: 'straight', flightWidth: 1000, steps: 14, hand: 'left' }, 1000, 3600))
      .toEqual(stairLayout({ form: 'straight', flightWidth: 1000, steps: 14 }, 1000, 3600));
  });
  it('每跑单独梯段宽：L 型平台为 f1×f2，踏步线长随各跑宽度', () => {
    const layout = stairLayout({ form: 'l', flightWidth: 1200, flightWidths: [1200, 800], steps: 14 }, 2400, 2400);
    const lengths = layout.lines.map(([a, b]) => Math.round(Math.hypot(b[0] - a[0], b[1] - a[1])));
    expect(lengths.filter(v => v === 1200)).toHaveLength(7);
    expect(lengths.filter(v => v === 800)).toHaveLength(7);
    expect(layout.outline).toMatchObject({ kind: 'polygon' });
    expect(layout.flightWidth).toBe(800);
    expect(stairFlightWidths({ form: 'triple', flightWidth: 900, steps: 17 })).toEqual([900, 900, 900]);
    expect(stairFlightWidths({ form: 'u', flightWidth: 900, flightWidths: [1000, 1100], steps: 16 })).toEqual([1000, 1100]);
  });
  it('边界：每跑宽 3 m、外框 1 m 时 L / U / 三跑不出现 NaN 或负尺寸', () => {
    for (const form of ['l', 'u', 'triple'] as const) for (const reverse of [false, true]) {
      const flightWidths = Array(form === 'triple' ? 3 : 2).fill(3000);
      const layout = stairLayout({ form, flightWidth: 3000, flightWidths, steps: 3, reverse, hand: 'left' }, 1000, 1000);
      expect([...layout.lines.flat(), ...layout.walk, ...layout.arrow, ...layout.breakLine, layout.label, layout.start].flat().every(Number.isFinite), form).toBe(true);
      expect(layout.treadDepth, form).toBeGreaterThan(0);
      expect(layout.flightWidth, form).toBeGreaterThan(0);
    }
  });
});

describe('楼梯参数编辑', () => {
  it('切换类别：外框与参数换成预设，位置与旋转保留，预设名与单价键随类别', () => {
    const next = applyStairForm({ ...legacy, rot: 90 }, 'u');
    expect(next).toMatchObject({ w: 2100, d: 3000, cx: 2000, cy: 2000, rot: 90, name: 'U 型楼梯', catalogId: 'stairs:U 型楼梯', stair: { form: 'u', flightWidth: 1000, steps: 16 } });
    expect(applyStairForm({ ...legacy, name: '主楼梯' }, 'spiral').name).toBe('主楼梯');
  });
  it('规范提示：踏步过窄、过高、梯段过窄时提示，满足时不提示', () => {
    expect(stairMetrics({ form: 'straight', flightWidth: 1000, steps: 14 }, 1000, 3600, 2800).warnings).toEqual([]);
    const metrics = stairMetrics({ form: 'straight', flightWidth: 700, steps: 12 }, 700, 2400, 2800);
    expect(metrics.treadDepth).toBe(200);
    expect(Math.round(metrics.riserHeight)).toBe(233);
    expect(metrics.warnings).toHaveLength(3);
  });
  it('编辑面板列出五种类别并高亮当前类别，显示踏步宽与踏步高', () => {
    const design: Design = { ...blankDesign(), height: 2800 };
    const f = { ...preset('L 型楼梯'), id: 'l', cx: 0, cy: 0, rot: 0 } as Furniture;
    const markup = renderToStaticMarkup(<StairEditor design={design} furniture={f} change={() => {}} />);
    expect((markup.match(/role="radio"/g) || []).length).toBe(5);
    expect(markup).toMatch(/aria-checked="true"[^>]*>.*?<span>L 型<\/span>/);
    expect(markup).toContain('踏步高（层高 ÷ 踏步数）');
    expect(markup).toContain('187 mm');
    expect(markup).toContain('第 1 跑宽 / m');
    expect(markup).toContain('第 2 跑宽 / m');
    expect(markup).not.toContain('第 3 跑宽');
    expect(markup).toContain('行走方向');
    expect(markup).toContain('转向');
    const triple = renderToStaticMarkup(<StairEditor design={design} furniture={{ ...preset('三跑楼梯'), id: 't', cx: 0, cy: 0, rot: 0 } as Furniture} change={() => {}} />);
    expect(triple).toContain('第 3 跑宽 / m');
    const straight = renderToStaticMarkup(<StairEditor design={design} furniture={{ ...preset('直跑楼梯'), id: 's', cx: 0, cy: 0, rot: 0 } as Furniture} change={() => {}} />);
    expect(straight).toContain('梯段宽 / m');
    expect(straight).not.toContain('跑宽');
    expect(straight).not.toContain('转向');
  });
  it('stair 字段经 JSON 往返保留；非法参数被校验拒绝', () => {
    const f = { ...preset('三跑楼梯'), id: 't', cx: 2000, cy: 2000, rot: 0 } as Furniture;
    const design: Design = { ...blankDesign(), furniture: [f] };
    expect(validateDesign(JSON.parse(JSON.stringify(design))).furniture[0].stair).toEqual(f.stair);
    const full = { ...f, stair: { ...f.stair!, flightWidths: [900, 1000, 1100], reverse: true, hand: 'left' as const } };
    expect(validateDesign(JSON.parse(JSON.stringify({ ...design, furniture: [full] }))).furniture[0].stair).toEqual(full.stair);
    for (const stair of [{ ...f.stair!, steps: 2 }, { ...f.stair!, steps: 41 }, { ...f.stair!, steps: 12.5 }, { ...f.stair!, form: 'x' }, { ...f.stair!, flightWidth: 100 },
      { ...f.stair!, flightWidths: [900, 900] }, { ...f.stair!, flightWidths: [900, 100, 900] }, { ...f.stair!, hand: 'up' }, { ...f.stair!, reverse: 'yes' }])
      expect(() => validateDesign({ ...design, furniture: [{ ...f, stair }] })).toThrow();
    expect(() => validateDesign({ ...design, furniture: [{ ...f, type: 'sofa' }] })).toThrow();
  });
  it('外框尺寸仍走家具尺寸事务，楼梯显示长宽', () => {
    let current: Design = { ...blankDesign(), furniture: [legacy] };
    const original = current;
    let commits = 0;
    const transaction = createSizeTransaction(() => current, next => { current = next; }, next => { current = next; commits++; });
    const selection = { kind: 'furniture' as const, id: 'stairs' };
    const markup = renderToStaticMarkup(<SizeFields design={current} selection={selection} transaction={transaction} />);
    expect(markup).toContain('长度 / m');
    expect(markup).toContain('value="3.00"');
    let token = transaction.begin(selection);
    transaction.update(token, sizeDraftToModel({ w: '1.2', d: '4' }));
    expect(current.furniture[0]).toMatchObject({ w: 1200, d: 4000 });
    transaction.cancel(token);
    expect(current).toBe(original);
    token = transaction.begin(selection);
    transaction.update(token, sizeDraftToModel({ w: '1.2', d: '4' }));
    transaction.apply(token);
    expect(commits).toBe(1);
    expect(validateDesign(JSON.parse(JSON.stringify(current))).furniture[0]).toMatchObject({ type: 'stairs', w: 1200, d: 4000 });
  });
});
