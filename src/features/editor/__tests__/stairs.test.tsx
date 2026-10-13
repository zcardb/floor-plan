import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { library } from '@/lib/floor-plan/catalog';
import { blankDesign } from '@/lib/floor-plan/templates';
import { validateDesign } from '@/lib/floor-plan/validation';
import { createSizeTransaction } from '../model/size-transaction';
import {
  STAIR_DEFAULTS, STAIR_PRESETS, applyStairForm, resizeStair, stairFlightLengths, stairFlightWidths, stairLayout, stairMetrics,
  stairRiser, stairSizeOf, stairSpec, stairStandardLengths, stairSteps, stairTread, stairWell, syncStairsToHeight, updateStair,
} from '@/lib/floor-plan/stairs';
import { furnitureDrawing } from '@/lib/drawing/furniture-drawing';
import { FurnitureShape } from '@/components/furniture-shape/furniture-shape';
import { SizeFields } from '../components/size-fields';
import { StairEditor } from '../components/stair-editor';
import { sizeDraftToModel } from '@/lib/floor-plan/length-units';
import { editSelection } from '../model/selection-edits';
import type { Design, Furniture } from '@/lib/floor-plan/types';

/** 旧数据里的楼梯：没有 stair 字段。 */
const legacy: Furniture = { id: 'stairs', type: 'stairs', name: '楼梯', catalogId: 'stairs:楼梯', w: 1000, d: 3000, cx: 2000, cy: 2000, rot: 0, color: '#e6dccc' };
const preset = (name: string) => library.find(item => item.name === name)!;
const markupOf = (f: Pick<Furniture, 'type' | 'w' | 'd' | 'color' | 'stair'>) => renderToStaticMarkup(<svg><FurnitureShape f={f} /></svg>);
const count = (markup: string, tag: string) => (markup.match(new RegExp(`<${tag} `, 'g')) || []).length;

describe('楼梯类别与平面图样', () => {
  it('素材库提供直跑 / L 型 / U 型 / 三跑 / 螺旋五种楼梯，均带参数', () => {
    expect(library.filter(item => item.type === 'stairs').map(item => item.stair?.form)).toEqual(['straight', 'l', 'u', 'triple', 'spiral']);
    // 外框由行业标准梯段长推导：16 级 × 280 mm 踏面宽 = 4480 mm。
    expect(preset('直跑楼梯')).toMatchObject({ w: 1000, d: 4480, stair: { form: 'straight', flightWidth: 1000, steps: 16 } });
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
    expect(count(markupOf(straight), 'line')).toBe(15);
    expect(count(markupOf({ ...straight, stair: { ...straight.stair!, steps: 18 } }), 'line')).toBe(17);
    const spiral = markupOf(preset('螺旋楼梯'));
    expect(count(spiral, 'circle')).toBe(3);
    expect(count(spiral, 'line')).toBe(17);
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
      const box = stairSizeOf(spec), right = stairLayout(spec, box.w, box.d), left = stairLayout({ ...spec, hand: 'left' }, box.w, box.d);
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
  it('切换类别：参数换成预设、外框按标准梯段长推导、位置与旋转保留，预设名与单价键随类别', () => {
    const next = applyStairForm({ ...legacy, rot: 90 }, 'u', 2800);
    // U 型 16 级：两跑各 8 级 × 280 = 2240；外框 = 1000 + 1000 + 梯井 200，进深 = 平台 1000 + 2240。
    expect(next).toMatchObject({ w: 2200, d: 3240, cx: 2000, cy: 2000, rot: 90, name: 'U 型楼梯', catalogId: 'stairs:U 型楼梯',
      stair: { form: 'u', flightWidth: 1000, steps: 16, flightLengths: [2240, 2240] } });
    expect(applyStairForm({ ...legacy, name: '主楼梯' }, 'spiral').name).toBe('主楼梯');
    expect(applyStairForm(legacy, 'l', 3200).stair!.steps).toBe(18);
  });
  it('行业标准默认值：踏步高 175 / 踏面宽 280；踏步数 = 层高 ÷ 踏步高', () => {
    const spec = { form: 'straight' as const, flightWidth: 1000, steps: 16 };
    expect([stairRiser(spec), stairTread(spec)]).toEqual([STAIR_DEFAULTS.riserHeight, STAIR_DEFAULTS.treadDepth]);
    expect(stairSteps(2800)).toBe(16);
    expect(stairSteps(3200)).toBe(18);
    expect(stairSteps(3000, 150)).toBe(20);
    expect(stairSteps(100000)).toBe(40);
    expect(stairStandardLengths({ form: 'triple', flightWidth: 900, steps: 16 })).toEqual([6 * 280, 5 * 280, 5 * 280]);
  });
  it('梯段长：外框跟着梯段长推导；L 型平台为 f1 × f2', () => {
    const straight = resizeStair({ ...legacy, stair: { form: 'straight', flightWidth: 1000, steps: 16 } }, {}, 2800, [4000]);
    expect(straight).toMatchObject({ w: 1000, d: 4000 });
    const shorter = resizeStair(straight, {}, 2800, [2800]);
    expect(shorter.d).toBe(2800);
    const lStair = { ...legacy, ...applyStairForm(legacy, 'l', 2800) };
    const l = resizeStair(lStair, {}, 2800, [2400, 1600]);
    expect(l).toMatchObject({ w: 900 + 1600, d: 900 + 2400 });
    expect(stairFlightLengths(l.stair!, l.w, l.d).map(Math.round)).toEqual([2400, 1600]);
    const layout = stairLayout(l.stair!, l.w, l.d);
    expect(layout.outline).toMatchObject({ kind: 'polygon' });
    expect(layout.lines).toContainEqual([[-l.w / 2, -l.d / 2 + 900], [-l.w / 2 + 900, -l.d / 2 + 900]]);
  });
  it('U 型两跑可不等长：外框进深取较长一跑，行走线贯通，梯井线存在', () => {
    const u = resizeStair(applyStairForm(legacy, 'u', 2800), {}, 2800, [2600, 1800]);
    expect(u.d).toBe(1000 + 2600);
    expect(stairFlightLengths(u.stair!, u.w, u.d).map(Math.round)).toEqual([2600, 1800]);
    const layout = stairLayout(u.stair!, u.w, u.d);
    expect(layout.outline).toMatchObject({ kind: 'polygon' });
    expect(layout.walk).toHaveLength(4);
    expect(layout.lines.filter(([a, b]) => a[0] === b[0]).length).toBeGreaterThanOrEqual(2);
    expect([...layout.lines.flat(), ...layout.walk].flat().every(Number.isFinite)).toBe(true);
  });
  it('改踏面宽或踏步数时梯段长回到「踏步数 × 踏面宽」；只改梯段宽时保留梯段长', () => {
    const l = resizeStair(applyStairForm(legacy, 'l', 2800), {}, 2800, [2400, 1600]);
    expect(resizeStair(l, { flightWidth: 1000, flightWidths: [1000, 900] }, 2800).stair!.flightLengths).toEqual([2400, 1600]);
    expect(resizeStair(l, { treadDepth: 300 }, 2800).stair!.flightLengths).toEqual([2400, 2400]);
    expect(resizeStair(l, { steps: 18, stepsManual: true }, 2800).stair!.flightLengths).toEqual([9 * 280, 9 * 280]);
  });
  it('踏步数：自动时随层高变化，手动后不变；踏步高改变时自动重算', () => {
    const auto = applyStairForm(legacy, 'straight', 2800);
    expect(auto.stair!.steps).toBe(16);
    const taller = syncStairsToHeight({ ...blankDesign(), height: 3200, furniture: [auto] });
    expect(taller.furniture[0].stair).toMatchObject({ steps: 18, flightLengths: [18 * 280] });
    expect(taller.furniture[0].d).toBe(18 * 280);
    const manual = resizeStair(auto, { steps: 14, stepsManual: true }, 2800);
    expect(syncStairsToHeight({ ...blankDesign(), height: 3200, furniture: [manual] }).furniture[0].stair!.steps).toBe(14);
    expect(resizeStair(auto, { riserHeight: 150 }, 2800).stair!.steps).toBe(19);
    const unchanged = { ...blankDesign(), height: 2800, furniture: [auto, legacy] };
    expect(syncStairsToHeight(unchanged)).toBe(unchanged);
  });
  it('螺旋楼梯：外框由踏面宽（距内侧 0.25 m 量）与踏步数推导', () => {
    const spec = updateStair({ form: 'spiral', flightWidth: 800, steps: 16 }, {});
    const { w, d } = stairSizeOf(spec);
    expect(w).toBe(d);
    expect(spec.flightLengths).toBeUndefined();
    expect(stairMetrics(spec, w, d, 2800).treadDepth).toBeCloseTo(280, 5);
  });
  it('规范提示：踏步过窄、过高、梯段过窄时提示，满足时不提示', () => {
    expect(stairMetrics({ form: 'straight', flightWidth: 1000, steps: 14 }, 1000, 3600, 2800).warnings).toEqual([]);
    const metrics = stairMetrics({ form: 'straight', flightWidth: 700, steps: 12 }, 700, 2400, 2800);
    expect(metrics.treadDepth).toBe(200);
    expect(Math.round(metrics.riserHeight)).toBe(233);
    expect(metrics.warnings).toHaveLength(3);
  });
  it('编辑面板：五种类别、每跑宽 + 长、踏面宽 / 踏步高、自动踏步数与推导结果', () => {
    const design: Design = { ...blankDesign(), height: 2800 };
    const f = { ...preset('L 型楼梯'), id: 'l', cx: 0, cy: 0, rot: 0 } as Furniture;
    const markup = renderToStaticMarkup(<StairEditor design={design} furniture={f} change={() => {}} />);
    expect((markup.match(/role="radio"/g) || []).length).toBe(5);
    expect(markup).toMatch(/aria-checked="true"[^>]*>.*?<span>L 型<\/span>/);
    for (const label of ['第 1 跑宽 / m', '第 1 跑长 / m', '第 2 跑宽 / m', '第 2 跑长 / m', '踏面宽 / m', '踏步高 / m', '行走方向', '转向', '实际踏步高', '外框'])
      expect(markup, label).toContain(label);
    expect(markup).not.toContain('第 3 跑');
    expect(markup).toContain('>自动<');
    expect(markup).toContain('value="0.28"');
    expect(markup).toContain('value="0.17"');
    const manual = renderToStaticMarkup(<StairEditor design={design} furniture={resizeStair(f, { steps: 14, stepsManual: true }, 2800)} change={() => {}} />);
    expect(manual).toContain('>手动<');
    expect(manual).toContain('按层高算 16 级');
    const triple = renderToStaticMarkup(<StairEditor design={design} furniture={{ ...preset('三跑楼梯'), id: 't', cx: 0, cy: 0, rot: 0 } as Furniture} change={() => {}} />);
    expect(triple).toContain('第 3 跑长 / m');
    const straight = renderToStaticMarkup(<StairEditor design={design} furniture={{ ...preset('直跑楼梯'), id: 's', cx: 0, cy: 0, rot: 0 } as Furniture} change={() => {}} />);
    expect(straight).toContain('梯段宽 / m');
    expect(straight).toContain('梯段长 / m');
    expect(straight).not.toContain('跑宽');
    expect(straight).not.toContain('转向');
    const spiral = renderToStaticMarkup(<StairEditor design={design} furniture={{ ...preset('螺旋楼梯'), id: 'p', cx: 0, cy: 0, rot: 0 } as Furniture} change={() => {}} />);
    expect(spiral).not.toContain('梯段长');
    const u = renderToStaticMarkup(<StairEditor design={design} furniture={{ ...preset('U 型楼梯'), id: 'u', cx: 0, cy: 0, rot: 0 } as Furniture} change={() => {}} />);
    expect(u).toContain('梯井宽 / m');
    expect(u).toContain('value="0.20"');
    expect(u).toContain('第 1 跑宽 1.00 + 梯井 0.20 + 第 2 跑宽 1.00 = 2.20 m');
    expect(u).toContain('梯井是 U 型两跑梯段之间的竖向空档');
    expect(straight).not.toContain('梯井');
  });
  it('stair 字段经 JSON 往返保留；非法参数被校验拒绝', () => {
    const f = { ...preset('三跑楼梯'), id: 't', cx: 2000, cy: 2000, rot: 0 } as Furniture;
    const design: Design = { ...blankDesign(), furniture: [f] };
    expect(validateDesign(JSON.parse(JSON.stringify(design))).furniture[0].stair).toEqual(f.stair);
    const full = { ...f, stair: { ...f.stair!, flightWidths: [900, 1000, 1100], flightLengths: [1500, 1200, 1400], treadDepth: 260, riserHeight: 160,
      stepsManual: true, reverse: true, hand: 'left' as const } };
    expect(validateDesign(JSON.parse(JSON.stringify({ ...design, furniture: [full] }))).furniture[0].stair).toEqual(full.stair);
    for (const stair of [{ ...f.stair!, steps: 2 }, { ...f.stair!, steps: 41 }, { ...f.stair!, steps: 12.5 }, { ...f.stair!, form: 'x' }, { ...f.stair!, flightWidth: 100 },
      { ...f.stair!, flightWidths: [900, 900] }, { ...f.stair!, flightWidths: [900, 100, 900] }, { ...f.stair!, hand: 'up' }, { ...f.stair!, reverse: 'yes' },
      { ...f.stair!, flightLengths: [1500, 1500] }, { ...f.stair!, flightLengths: [1500, 100, 1500] }, { ...f.stair!, treadDepth: 50 },
      { ...f.stair!, riserHeight: 500 }, { ...f.stair!, stepsManual: 'yes' }])
      expect(() => validateDesign({ ...design, furniture: [{ ...f, stair }] }), JSON.stringify(stair)).toThrow();
    expect(() => validateDesign({ ...design, furniture: [{ ...f, type: 'sofa' }] })).toThrow();
  });
  it('边界：极小外框与 20 m 梯段长都不出现 NaN 或负尺寸', () => {
    for (const form of ['straight', 'l', 'u', 'triple'] as const) {
      const base = applyStairForm(legacy, form, 2800), count = base.stair!.flightLengths!.length;
      const long = resizeStair(base, {}, 2800, Array(count).fill(20000));
      for (const [s, w, d] of [[long.stair!, long.w, long.d], [base.stair!, 1000, 1000]] as const) {
        const layout = stairLayout(s, w, d);
        expect([...layout.lines.flat(), ...layout.walk, ...layout.arrow, layout.label].flat().every(Number.isFinite), form).toBe(true);
        expect(layout.treadDepth, form).toBeGreaterThan(0);
      }
    }
  });
  it('在尺寸里直接改外框：反推各跑宽与梯井，之后调细节外框不再回退', () => {
    const u = { ...preset('U 型楼梯'), id: 'u', cx: 0, cy: 0, rot: 0 } as Furniture;
    expect([u.w, u.d]).toEqual([2200, 3240]);
    // 用户把外框宽改成 1.80 m：两跑等比缩到 0.80，梯井保持 0.20。
    const narrow = editSelection({ ...blankDesign(), furniture: [u] }, { kind: 'furniture', id: 'u' }, { w: 1800 }).furniture[0];
    expect(narrow.stair).toMatchObject({ flightWidths: [800, 800], wellGap: 200 });
    expect(narrow.w).toBe(1800);
    // 接着改踏面宽：外框宽度保持 1.80，不再跳回 1.94。
    const deeper = editSelection({ ...blankDesign(), furniture: [narrow] }, { kind: 'furniture', id: 'u' }, { d: 3000 }).furniture[0];
    expect(deeper.w).toBe(1800);
    const after = resizeStair(deeper, { treadDepth: 300 }, 2800);
    expect(after.w).toBe(1800);
    expect(after.stair!.wellGap).toBe(200);
    expect(validateDesign({ ...blankDesign(), furniture: [after] }).furniture[0].w).toBe(1800);
    // 直跑：改外框即改梯段宽与梯段长。
    const straight = editSelection({ ...blankDesign(), furniture: [{ ...preset('直跑楼梯'), id: 's', cx: 0, cy: 0, rot: 0 }] }, { kind: 'furniture', id: 's' }, { w: 1200, d: 5000 }).furniture[0];
    expect(straight.stair).toMatchObject({ flightWidth: 1200, flightLengths: [5000] });
    // 没有 stair 字段的老楼梯不受影响。
    const legacyRow = editSelection({ ...blankDesign(), furniture: [legacy] }, { kind: 'furniture', id: 'stairs' }, { w: 1200 }).furniture[0];
    expect(legacyRow).toMatchObject({ w: 1200 });
    expect(legacyRow.stair).toBeUndefined();
  });
  it('梯井可单独调：改大梯井则外框变宽；非法值被拒绝', () => {
    const u = { ...preset('U 型楼梯'), id: 'u', cx: 0, cy: 0, rot: 0 } as Furniture;
    const wider = resizeStair(u, { wellGap: 400 }, 2800);
    expect(wider.stair!.wellGap).toBe(400);
    expect(wider.w).toBe(2400);
    expect(stairWell({ ...u.stair!, wellGap: 0 })).toBe(0);
    expect(stairWell(u.stair!)).toBe(200);
    expect(stairWell({ form: 'straight', flightWidth: 1000, steps: 16 })).toBe(0);
    for (const wellGap of [{ wellGap: -1 }, { wellGap: 2000 }, { wellGap: 1000.5 }])
      expect(() => validateDesign({ ...blankDesign(), furniture: [{ ...u, stair: { ...u.stair!, ...wellGap } }] }), JSON.stringify(wellGap)).toThrow();
    for (const wellGap of [0, 100, 200, 1000])
      expect(validateDesign({ ...blankDesign(), furniture: [{ ...u, stair: { ...u.stair!, wellGap } }] }).furniture[0].stair!.wellGap, String(wellGap)).toBe(wellGap);
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
