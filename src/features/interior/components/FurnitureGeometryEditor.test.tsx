import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { FurnitureGeometryEditor } from './FurnitureGeometryEditor';
const state=vi.hoisted(()=>({image:'',busy:false,error:'',generate:vi.fn(),cancel:vi.fn()}));
vi.mock('../cloud/useFurnitureImage',()=>({useFurnitureImage:()=>state}));
const item={catalogId:'test-fireplace',name:'火炉',category:'客厅',type:'fireplace',shape:'circle' as const,w:1500,d:1500,height:800,color:'#aa8866',imageUrl:'https://example.com/old.webp'};
const render=()=>renderToStaticMarkup(createElement(FurnitureGeometryEditor,{item,save:async()=>true,onSaved:()=>{}}));
describe('家具编辑重新生成入口',()=>{
  it('未生成时提供独立几何保存及显式生成，不展示旧图为候选',()=>{
    state.image='';const html=render();
    expect(html).toContain('重新生成图片');expect(html).toContain('保存参考几何');
    expect(html).toContain('直径 m');expect(html).not.toContain('尚未保存');expect(html).not.toContain(item.imageUrl);
  });
  it('候选只用于预览，提供手动保存与放弃',()=>{
    state.image='https://example.com/new.webp';const html=render();
    expect(html).toContain(state.image);expect(html).toContain('尚未保存');
    expect(html).toContain('保存参考几何与图片');expect(html).toContain('放弃新图片');state.image='';
  });
  it('生成中显示状态并禁用按钮，错误直接展示',()=>{
    state.busy=true;expect(render()).toContain('正在生成图片');expect(render()).toContain('disabled');state.busy=false;
    state.error='测试后端错误';expect(render()).toContain(state.error);state.error='';
  });
});
