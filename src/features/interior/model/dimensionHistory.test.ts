import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Design } from './types';
const hooks=vi.hoisted(()=>({refs:[] as {current:unknown}[],r:0,values:[] as unknown[],s:0}));
vi.mock('react',async original=>({...await original<typeof import('react')>(),
  useRef:(value:unknown)=>{const i=hooks.r++;return hooks.refs[i]||(hooks.refs[i]={current:value});},
  useState:(value:unknown)=>{const i=hooks.s++;if(!(i in hooks.values))hooks.values[i]=value;return [hooks.values[i],(next:unknown)=>{hooks.values[i]=next;}];},
  useCallback:(callback:unknown)=>callback,
}));
import { useDesign } from './useDesign';
import { blankDesign } from '../data/templates';
import { perimeterDimensions } from './perimeterDimensions';
import { editDimensionWalls } from './dimensionWallEdit';
beforeEach(()=>{hooks.refs=[];hooks.values=[];hooks.r=0;hooks.s=0;});
describe('净距操作使用原项目撤销历史',()=>{
  it('整组连接墙门窗在一次undo/redo中还原，不新增独立尺寸记录',()=>{
    const d=blankDesign();d.walls.push({id:'partition',a:[3000,0],b:[3000,d.depth],kind:'partition',thickness:240},
      {id:'branch',a:[1000,2000],b:[3000,2000],kind:'partition',thickness:240});
    d.openings.push({id:'opening',wallId:'partition',kind:'door',width:800,offset:3000});
    const notify=vi.fn();
    const RenderModel=()=>{hooks.r=0;hooks.s=0;return useDesign(d,notify);};
    let model=RenderModel();
    const binding=perimeterDimensions(d)!.chains.flatMap(c=>c.segments).find(s=>s.binding?.startWalls.includes('partition')&&s.binding.endWalls.includes('outer-1'))!.binding!;
    const next=editDimensionWalls(d,binding,2200,'end');model.commit(next,d);
    model=RenderModel();expect(model.counts).toEqual({undo:1,redo:0});expect(model.current.current).toEqual(next);
    model.undo();model=RenderModel();expect(model.current.current).toEqual(d);expect(model.counts).toEqual({undo:0,redo:1});
    model.redo();model=RenderModel();expect(model.current.current).toEqual(next);expect(model.counts).toEqual({undo:1,redo:0});
    expect((model.current.current as Design).measures).toEqual(d.measures);expect(notify).toHaveBeenCalledTimes(3);
  });
});
