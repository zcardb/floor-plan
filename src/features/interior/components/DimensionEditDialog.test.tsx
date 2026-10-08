import { Children, isValidElement, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { blankDesign } from '../data/templates';
import { perimeterDimensions } from '../model/perimeterDimensions';
const hooks=vi.hoisted(()=>({values:[] as unknown[],index:0}));
vi.mock('react',async original=>({...await original<typeof import('react')>(),useState:(initial:unknown)=>{const i=hooks.index++;if(!(i in hooks.values))hooks.values[i]=initial;return [hooks.values[i],(next:unknown)=>{hooks.values[i]=next;}];}}));
import { DimensionEditDialog } from './DimensionEditDialog';
function nodes(element:unknown):ReactElement<Record<string,unknown>>[]{
  if(!isValidElement(element))return [];
  const e=element as ReactElement<Record<string,unknown>>;
  return [e,...Children.toArray(e.props.children as React.ReactNode).flatMap(nodes)];
}
function fixture(){const d=blankDesign();d.walls.push({id:'partition',a:[3000,0],b:[3000,d.depth],thickness:240,kind:'partition'});
  const binding=perimeterDimensions(d)!.chains.flatMap(c=>c.segments).find(s=>s.binding?.startWalls.includes('partition')&&s.binding.endWalls.includes('outer-1'))!.binding!;
  return {design:d,binding};}
function harness(){const props={...fixture(),onApply:vi.fn(),onClose:vi.fn()};const render=()=>{hooks.index=0;return nodes(DimensionEditDialog(props));};return {...props,render};}
beforeEach(()=>{hooks.values=[];hooks.index=0;});
describe('净距对话框',()=>{
  it('输入仅修改草稿，应用时米转毫米且固定外墙侧',()=>{
    const h=harness();let all=h.render();const input=all.find(e=>e.props.id==='dimension-gap')!;
    (input.props.onChange as (e:unknown)=>void)({target:{value:'2.2'}});expect(h.onApply).not.toHaveBeenCalled();
    all=h.render();const apply=all.find(e=>e.props.children==='应用距离')!;(apply.props.onClick as ()=>void)();
    expect(h.onApply).toHaveBeenCalledWith(2200,'end');
  });
  it('取消不应用，结构校验错误保留对话框并显示',()=>{
    const h=harness();let all=h.render();(all.find(e=>e.props.children==='取消')!.props.onClick as ()=>void)();expect(h.onClose).toHaveBeenCalledOnce();expect(h.onApply).not.toHaveBeenCalled();
    h.onApply.mockImplementation(()=>{throw new Error('无法容纳门窗');});
    (all.find(e=>e.props.id==='dimension-gap')!.props.onChange as (e:unknown)=>void)({target:{value:'0.5'}});all=h.render();
    (all.find(e=>e.props.children==='应用距离')!.props.onClick as ()=>void)();
    all=h.render();expect(all.some(e=>e.props.role==='alert'&&e.props.children==='无法容纳门窗')).toBe(true);
  });
  it('输入框显示两位小数，未改动时应用只关闭不移动墙体',()=>{
    const f=fixture();const binding={...f.binding,end:f.binding.start+2594.82568359375};
    const props={design:f.design,binding,onApply:vi.fn(),onClose:vi.fn()};
    const all=nodes(DimensionEditDialog(props));
    expect(all.find(e=>e.props.id==='dimension-gap')!.props.value).toBe('2.59');
    (all.find(e=>e.props.children==='应用距离')!.props.onClick as ()=>void)();
    expect(props.onApply).not.toHaveBeenCalled();expect(props.onClose).toHaveBeenCalledOnce();
  });
});
