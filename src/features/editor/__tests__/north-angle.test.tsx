import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { blankDesign } from '@/lib/floor-plan/templates';
import { changeNorthAngle, northAngle } from '../model/north-angle';
import { validateDesign } from '@/lib/floor-plan/validation';
import { CompassRose } from '../components/compass-rose';
import { NorthSettings } from '../components/north-settings';

describe('项目朝向（北方角度）', () => {
  it('旧项目缺省为上北，校验后不新增字段', () => {
    const design = blankDesign();
    expect(northAngle(design)).toBe(0);
    expect(validateDesign(design).northAngle).toBeUndefined();
  });
  it('角度归一化到 0–359 并取整，不修改原对象，JSON 重载保留', () => {
    const original = blankDesign();
    expect(changeNorthAngle(original, 370).northAngle).toBe(10);
    expect(changeNorthAngle(original, -90).northAngle).toBe(270);
    expect(changeNorthAngle(original, 360).northAngle).toBe(0);
    expect(changeNorthAngle(original, 44.6).northAngle).toBe(45);
    expect(original.northAngle).toBeUndefined();
    const next = changeNorthAngle(original, 90);
    expect(validateDesign(JSON.parse(JSON.stringify(next))).northAngle).toBe(90);
  });
  it('非法角度在编辑与导入处被拒绝', () => {
    const design = blankDesign();
    for (const value of [NaN, Infinity]) expect(() => changeNorthAngle(design, value)).toThrow();
    for (const value of ['90', -1, 400, NaN]) expect(() => validateDesign({ ...design, northAngle: value })).toThrow();
  });
  it('指北针显示东南西北并标注角度，设置区显示当前角度与快捷按钮', () => {
    const html = renderToStaticMarkup(<CompassRose angle={30} />);
    for (const label of ['北', '东', '南', '西']) expect(html).toContain(`>${label}</text>`);
    expect(html).toContain('指北针：北偏 30°');
    expect(html).toContain('compass-label-north');
    const panel = renderToStaticMarkup(<NorthSettings design={changeNorthAngle(blankDesign(), 90)} change={() => {}} />);
    expect(panel).toContain('value="90"');
    expect(panel).toContain('右北');
    expect(panel).toContain('aria-pressed="true"');
  });
});
