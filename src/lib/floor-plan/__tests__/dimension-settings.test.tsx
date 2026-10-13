import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { blankDesign } from '../templates';
import { changeDimensionSetting, defaultDimensionSettings, dimensionSettings } from '../dimension-settings';
import { perimeterDimensions, planDrawingBounds } from '../perimeter-dimensions';
import { validateDesign } from '../validation';
import { DimensionSettings } from '@/features/editor/components/dimension-settings';
import { PerimeterDimensions } from '@/features/editor/components/perimeter-dimensions';

describe('外围标注配置',()=>{
  it('旧项目默认值保留，新控件显示米制距离和开关',()=>{
    const design = blankDesign();
    expect(dimensionSettings(design)).toEqual(defaultDimensionSettings);
    expect(validateDesign(design).dimensionSettings).toBeUndefined();
    const html = renderToStaticMarkup(<DimensionSettings design={design} change={()=>{}}/>);
    expect(html).toContain('role="switch"');
    expect(html).toContain('value="0.65"');
    expect(html).toContain('上侧距离 / m');
  });
  it('配置改变位置和导出边界，不改变墙体派生数字；JSON重载保留',()=>{
    const original = blankDesign();
    let next = changeDimensionSetting(original,'top',10000);
    next = changeDimensionSetting(next,'bottom',0);
    next = changeDimensionSetting(next,'left',2000);
    next = changeDimensionSetting(next,'right',3000);
    next = changeDimensionSetting(next,'visible',false);
    const before = perimeterDimensions(original)!, after = perimeterDimensions(next)!;
    expect(after.top).toBe(before.top-9350);
    expect(after.bottom).toBe(before.bottom-750);
    expect(after.left).toBe(before.left-1200);
    expect(after.right).toBe(before.right+2100);
    expect(after.horizontal).toEqual(before.horizontal);
    expect(after.vertical).toEqual(before.vertical);
    expect(planDrawingBounds(next,true).y).toBeLessThan(planDrawingBounds(original,true).y);
    expect(renderToStaticMarkup(<svg><PerimeterDimensions layout={after}/></svg>)).toContain(`y1="${after.top}"`);
    expect(validateDesign(JSON.parse(JSON.stringify(next))).dimensionSettings).toEqual(next.dimensionSettings);
    expect(original.dimensionSettings).toBeUndefined();
  });
  it('边界可用，非法距离和显示类型在编辑与导入处被拒绝',()=>{
    const design = blankDesign();
    for(const value of [0,10000]) expect(()=>validateDesign(changeDimensionSetting(design,'top',value))).not.toThrow();
    for(const value of [-1,10001,NaN,Infinity]) {
      expect(()=>changeDimensionSetting(design,'top',value)).toThrow();
      expect(()=>validateDesign({...design,dimensionSettings:{top:value}})).toThrow();
    }
    expect(()=>changeDimensionSetting(design,'visible',1)).toThrow();
    expect(()=>validateDesign({...design,dimensionSettings:{visible:'yes'}})).toThrow();
  });
});
