import { describe, expect, it } from 'vitest';
import { blankDesign, referenceDesign } from '../data/templates';
import { editDimensionWalls, dimensionEditPolicy } from './dimensionWallEdit';
import { perimeterDimensions } from './perimeterDimensions';
import type { Design, Wall } from './types';
import type { DimensionBinding } from './dimensionBinding';
const wall=(id:string,a:Wall['a'],b:Wall['b']):Wall=>({id,a,b,thickness:240,kind:'partition'});
function fixture(){const d=blankDesign();d.walls.push(wall('partition',[3000,0],[3000,d.depth]));return d;}
function binding(d:Design,startId:string,endId:string,axis:0|1=0):DimensionBinding{
  const result=perimeterDimensions(d)!.chains.flatMap(c=>c.segments).find(s=>s.binding?.axis===axis&&s.binding.startWalls.includes(startId)&&s.binding.endWalls.includes(endId));
  expect(result,`${startId}/${endId}`).toBeDefined();return result!.binding!;
}
describe('净距驱动真实墙体',()=>{
  it('用户承重标记固定目标和连接端点，普通另一侧仍可移动',()=>{
    const d=fixture();d.walls.find(w=>w.id==='partition')!.loadBearing=true;
    expect(dimensionEditPolicy(d,binding(d,'partition','outer-1')).reason).toBeTruthy();
    d.walls.push(wall('second',[5000,0],[5000,d.depth]));
    const b=binding(d,'partition','second');expect(dimensionEditPolicy(d,b).fixed).toBe('start');
    const next=editDimensionWalls(d,b,1500,'start');expect(next.walls.find(w=>w.id==='partition')).toEqual(d.walls.find(w=>w.id==='partition'));
    const connected=fixture();connected.walls.push({...wall('locked',[1000,2000],[3000,2000]),loadBearing:true});
    expect(()=>editDimensionWalls(connected,binding(connected,'partition','outer-1'),1500,'end')).toThrow('承重');
  });
  it('外墙固定，隔墙移动到指定墙面净距，不改变厚度或家具',()=>{
    const d=fixture(),b=binding(d,'partition','outer-1'),before=JSON.stringify(d);
    expect(dimensionEditPolicy(d,b)).toEqual({fixed:'end',chooseSide:false});
    const next=editDimensionWalls(d,b,2200,'end');
    const moved=next.walls.find(w=>w.id==='partition')!;
    expect(moved.a[0]).toBe(d.width-2200-120);expect(moved.b[0]).toBe(moved.a[0]);expect(moved.thickness).toBe(240);
    expect(next.walls.find(w=>w.id==='outer-1')).toEqual(d.walls.find(w=>w.id==='outer-1'));
    expect(next.furniture).toBe(d.furniture);expect(JSON.stringify(d)).toBe(before);
    expect(binding(next,'partition','outer-1').end-binding(next,'partition','outer-1').start).toBeCloseTo(2200);
  });
  it('两隔墙明确固定侧，竖向净距也可驱动水平隔墙',()=>{
    const d=fixture();d.walls.push(wall('second',[5000,0],[5000,d.depth]));
    const b=binding(d,'partition','second');expect(dimensionEditPolicy(d,b).chooseSide).toBe(true);
    const right=editDimensionWalls(d,b,1500,'start');expect(right.walls.find(w=>w.id==='partition')).toEqual(d.walls.find(w=>w.id==='partition'));
    expect(right.walls.find(w=>w.id==='second')!.a[0]).toBe(4740);
    const left=editDimensionWalls(d,b,1500,'end');expect(left.walls.find(w=>w.id==='partition')!.a[0]).toBe(3260);
    const horizontal=blankDesign();horizontal.walls.push(wall('horizontal',[0,2000],[horizontal.width,2000]));
    const verticalBinding=binding(horizontal,'outer-0','horizontal',1);
    expect(editDimensionWalls(horizontal,verticalBinding,1800,'start').walls.find(w=>w.id==='horizontal')!.a[1]).toBe(1920);
  });
  it('连接墙端点伸缩，目标墙门窗随墙移动，连接墙开口世界位置保持',()=>{
    const d=fixture();d.walls.push(wall('branch',[1000,2000],[3000,2000]));
    d.openings.push({id:'targetDoor',wallId:'partition',kind:'door',width:800,offset:3000},
      {id:'branchWindow',wallId:'branch',kind:'window',width:400,offset:700});
    const b=binding(d,'partition','outer-1');const next=editDimensionWalls(d,b,b.end-b.start-500,'end');
    expect(next.walls.find(w=>w.id==='branch')!.b[0]).toBe(3500);
    expect(next.openings.find(o=>o.id==='targetDoor')!.offset).toBe(3000);
    expect(next.openings.find(o=>o.id==='branchWindow')!.offset).toBeCloseTo(700);
  });
  it('起点连接墙伸缩时重算offset，不能容纳门窗则整次拒绝',()=>{
    const d=fixture();d.walls.push(wall('branch',[3000,2000],[5000,2000]));
    d.openings.push({id:'opening',wallId:'branch',kind:'window',width:400,offset:1000});
    const b=binding(d,'partition','outer-1'),next=editDimensionWalls(d,b,b.end-b.start-500,'end');
    expect(next.openings[0].offset).toBe(500);
    expect(()=>editDimensionWalls(d,b,b.end-b.start-1200,'end')).toThrow();
  });
  it('同带共线多个墙段整体平移',()=>{
    const d=blankDesign();d.walls.push(wall('first',[3000,0],[3000,2000]),wall('second',[3000,2000],[3000,d.depth]));
    const b=binding(d,'first','outer-1');expect(b.startWalls).toEqual(['first','second']);
    const next=editDimensionWalls(d,b,2000,'end');expect(next.walls.filter(w=>['first','second'].includes(w.id)).map(w=>w.a[0])).toEqual([d.width-2120,d.width-2120]);
  });
  it('只读和非法输入拒绝，相同值无修改，过期墙位置不能使用',()=>{
    const d=fixture(),b=binding(d,'partition','outer-1');
    expect(dimensionEditPolicy(referenceDesign(),b).reason).toBeTruthy();expect(dimensionEditPolicy(d).reason).toBeTruthy();
    for(const v of [0,-1,NaN,Infinity,100001])expect(()=>editDimensionWalls(d,b,v,'end')).toThrow();
    expect(()=>editDimensionWalls(d,b,2000,'start')).toThrow('固定');
    expect(editDimensionWalls(d,b,b.end-b.start,'end')).toBe(d);
    const stale={...d,walls:d.walls.map(w=>w.id==='partition'?{...w,a:[3100,0] as Wall['a'],b:[3100,d.depth] as Wall['b']}:w)};
    expect(()=>editDimensionWalls(stale,b,2000,'end')).toThrow('变化');
  });
  it('不能跨过其他墙、改变承重端点或使连接墙退化',()=>{
    const d=fixture();d.walls.push(wall('second',[5000,0],[5000,d.depth]));
    expect(()=>editDimensionWalls(d,binding(d,'partition','second'),6000,'start')).toThrow();
    const locked=fixture();locked.walls.push({...wall('locked',[1000,2000],[3000,2000]),kind:'bearing'});
    expect(()=>editDimensionWalls(locked,binding(locked,'partition','outer-1'),1500,'end')).toThrow('承重');
  });
  it('结构解锁的参考户型可以按净距移动墙体',()=>{
    const d={...referenceDesign(),structureUnlocked:true};
    const b=binding(d,'w6','w10');
    const policy=dimensionEditPolicy(d,b);
    expect(policy.reason).toBeUndefined();
    const fixed=policy.fixed??'start',moving=fixed==='start'?'w10':'w6';
    const next=editDimensionWalls(d,b,b.end-b.start-100,fixed);
    expect(next.walls.find(w=>w.id===moving)!.a).not.toEqual(d.walls.find(w=>w.id===moving)!.a);
    expect(next.rooms.map(r=>r.name)).toEqual(d.rooms.map(r=>r.name));
  });
});
