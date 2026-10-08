import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createProject } from '../data/templates';
import { createSizeTransaction } from '../model/sizeTransaction';
import { SizeFields } from './SizeFields';
import { Library } from './Library';
import { EditorSelect } from './EditorSelect';
import { PriceInput } from './PriceInput';

const render=(node:Parameters<typeof renderToStaticMarkup>[0])=>renderToStaticMarkup(node);
describe('编辑控件与米制 UI',()=>{
  it('尺寸输入使用米，旋转保留度和旧模型值',()=>{
    const design=createProject('reference').state;
    const furniture=design.furniture[0];
    const transaction=createSizeTransaction(()=>design,()=>{},()=>{});
    const html=render(createElement(SizeFields,{design,selection:{kind:'furniture',id:furniture.id},transaction}));
    expect(html).toContain('宽 / m');
    expect(html).toContain(`value="${(furniture.w/1000).toFixed(2)}"`);
    expect(html).toContain('step="0.01"');
    expect(html).toContain('旋转 / °');
    expect(html).toContain(`value="${furniture.rot}"`);
    expect(html).not.toContain('/ mm');
  });
  it('材质使用 shadcn combobox，不渲染原生 select',()=>{
    const html=render(createElement(EditorSelect,{label:'墙面',value:'paint',options:[{value:'paint',label:'乳胶漆'},{value:'wallpaper',label:'墙纸'}],onChange:()=>{}}));
    expect(html).toContain('role="combobox"');
    expect(html).toContain('墙面');
    // Radix keeps an invisible select for native form/autofill integration.
    const selects: string[]=Array.from(html.matchAll(/<select[^>]*>/g),match=>match[0]);
    expect(selects.every(tag=>tag.includes('aria-hidden="true"'))).toBe(true);
  });
  it('素材库尺寸摘要统一米制',()=>{
    const html=render(createElement(Library,{add:()=>{},setTool:()=>{},blank:true}));
    expect(html).toContain('2.40 × 0.90 m');
    expect(html).not.toContain(' mm');
  });
  it('单价保留禁用和空值语义',()=>{
    const html=render(createElement(PriceInput,{value:null,disabled:true,onApply:()=>{}}));
    expect(html).toContain('placeholder="未定价"');
    expect(html).toContain('disabled');
    expect(html).toContain('value=""');
    expect(html).toContain('type="button"');
  });
});
