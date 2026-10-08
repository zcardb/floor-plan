import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Design } from './types';
const hooks=vi.hoisted(()=>({refs:[] as {current:unknown}[],r:0,values:[] as unknown[],s:0}));
vi.mock('react',async original=>({...await original<typeof import('react')>(),
  useRef:(value:unknown)=>{const i=hooks.r++;return hooks.refs[i]||(hooks.refs[i]={current:value});},
  useState:(value:unknown)=>{const i=hooks.s++;if(!(i in hooks.values))hooks.values[i]=value;return [hooks.values[i],(next:unknown)=>{hooks.values[i]=next;}];},
  useCallback:(callback:unknown)=>callback,
}));
import { useDesign } from './useDesign';
import { splitWall } from './wallSplit';
import { mergeWall } from './wallMerge';
import { setWallBearing } from './wallPolicy';
import { blankDesign } from '../data/templates';
import { perimeterDimensions } from './perimeterDimensions';
import { editDimensionWalls } from './dimensionWallEdit';
beforeEach(()=>{hooks.refs=[];hooks.values=[];hooks.r=0;hooks.s=0;});
describe('净距操作使用原项目撤销历史',()=>{
  it('合并一次历史、撤销恢复局部承重与洞口、重做恢复整墙',()=>{
    const d=blankDesign();d.openings.push({id:'o',wallId:'outer-0',kind:'window',offset:2000,width:800});
    const split=splitWall(d,'outer-0',[300],0);const before=setWallBearing(split.design,'outer-0',true);
    const RenderModel=()=>{hooks.r=0;hooks.s=0;return useDesign(before,vi.fn());};
    let model=RenderModel();const result=mergeWall(before,'outer-0');model.commit(result.design,before);
    model=RenderModel();expect(model.counts.undo).toBe(1);model.undo();model=RenderModel();expect(model.current.current).toEqual(before);
    model.redo();model=RenderModel();expect(model.current.current).toEqual(result.design);
  });
  it('分割和承重标记是独立历史，撤销重做精确还原墙和洞口ID',()=>{
    const d=blankDesign();d.walls.push({id:'p',a:[3000,0],b:[3000,6000],kind:'partition',thickness:240});
    d.openings.push({id:'o',wallId:'p',kind:'door',offset:2000,width:900});
    const RenderModel=()=>{hooks.r=0;hooks.s=0;return useDesign(d,vi.fn());};
    let model=RenderModel();const token=model.sizeTransaction.begin({kind:'wall',id:'p'});
    model.sizeTransaction.update(token,{length:'5000'});model.sizeTransaction.cancel();
    const result=splitWall(model.current.current,'p',[300],0);model.commit(result.design,model.current.current);
    model=RenderModel();expect(model.counts.undo).toBe(1);expect(model.current.current.openings[0].wallId).not.toBe('p');
    model.change(before=>setWallBearing(before,result.selectedId,true));model=RenderModel();expect(model.counts.undo).toBe(2);
    model.undo();model=RenderModel();expect(model.current.current).toEqual(result.design);
    model.undo();model=RenderModel();expect(model.current.current).toEqual(d);
    model.redo();model=RenderModel();expect(model.current.current).toEqual(result.design);
    model.redo();model=RenderModel();expect(model.current.current.walls.find(w=>w.id==='p')!.loadBearing).toBe(true);
  });
  it('标记复用一次历史提交、取消尺寸预览，重复标记不增加记录',()=>{
    const d=blankDesign();d.walls.push({id:'partition',a:[3000,0],b:[3000,d.depth],kind:'partition',thickness:240});
    const RenderModel=()=>{hooks.r=0;hooks.s=0;return useDesign(d,vi.fn());};
    let model=RenderModel();const token=model.sizeTransaction.begin({kind:'wall',id:'partition'});
    model.sizeTransaction.update(token,{length:'5000'});
    model.change(before=>setWallBearing(before,'partition',true));model=RenderModel();
    expect(model.current.current.walls.find(w=>w.id==='partition')!.b).toEqual([3000,6000]);
    expect(model.counts.undo).toBe(1);model.change(before=>setWallBearing(before,'partition',true));model=RenderModel();expect(model.counts.undo).toBe(1);
    model.undo();model=RenderModel();expect(model.current.current).toEqual(d);
    model.redo();model=RenderModel();expect(model.current.current.walls.find(w=>w.id==='partition')!.loadBearing).toBe(true);
  });
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
