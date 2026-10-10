import {it,expect} from 'vitest';
import {blankDesign} from '../data/templates';
import {resolveDrawPoint,resolveWallPoint,resolveWallHover,steppedPointOnWall,validateWallSegment} from './wallDrawing';
it('悬停测距独立投影，不受起笔轴向或连接吸附开关影响',()=>{const d=fixture();const raw:[number,number]=[1950,1800];expect(resolveWallHover(raw,d,0.1,50).point).toEqual([2000,1800]);expect(resolveWallPoint(raw,d,0.1,true,[500,1000]).point).toEqual([2000,1000]);expect(resolveWallPoint(raw,d,0.1,false,[500,1000]).target).toBeUndefined();expect(resolveWallHover(raw,d,0.1,50).target?.wallId).toBe('v');expect(resolveWallHover([1000,1800],d,0.1,50).target).toBeUndefined();expect(resolveWallHover(raw,{...d,demolished:['v']},0.1,50).target).toBeUndefined();});
it('悬停接近端点仍使用鼠标投影，不因端点优先冻结读数',()=>{expect(resolveWallHover([1950,50],fixture(),0.1,50).point).toEqual([2000,50]);});
it('端点轻微错位时默认精确连接，关闭吸附或阈值外不修正',()=>{const d=fixture();expect(resolveWallPoint([1950,40],d,0.1,true,[500,30])).toEqual({point:[2000,0],target:{wallId:'v',kind:'endpoint'}});expect(resolveWallPoint([1950,40],d,0.1,false,[500,30]).point).toEqual([1950,30]);expect(resolveWallPoint([1850,40],d,0.1,true,[500,30]).target?.kind).toBe('intersection');expect(resolveWallPoint([1950,40],d,1,true,[500,30]).target?.kind).not.toBe('endpoint');expect(resolveWallPoint([2000,120],d,0.1,true).target?.kind).toBe('endpoint');expect(resolveWallPoint([2000,121],d,0.1,true).target?.kind).toBe('intersection');});
const fixture=()=>({...blankDesign(),walls:[{id:'v',a:[2000,0] as [number,number],b:[2000,3000] as [number,number],thickness:240,kind:'partition' as const}]});
it('轴向约束先执行，T形吸附最终坐标准确',()=>{const d=fixture();expect(resolveWallPoint([1950,1050],d,0.1,true,[500,1000])).toEqual({point:[2000,1000],target:{wallId:'v',kind:'intersection'}});expect(resolveWallPoint([1600,1050],d,0.1,true,[500,1000]).target).toBeUndefined();});
it('关闭吸附、排除自身、缩放阈值一致',()=>{const d=fixture();expect(resolveWallPoint([1950,1000],d,0.1,false,[500,1000]).point).toEqual([1950,1000]);expect(resolveWallPoint([1950,1000],d,0.1,true,[500,1000],'v').target).toBeUndefined();expect(resolveWallPoint([1800,0],d,0.1,true).target).toBeDefined();expect(resolveWallPoint([1700,0],d,0.1,true).target).toBeUndefined();});
it('门窗洞口边也可吸附：落点即洞口边，墙端点优先且支持排除',()=>{
  const d=fixture();d.openings=[{id:'w',wallId:'v',kind:'window',offset:1000,width:900}];
  // v 上的窗洞边在 y=550 / 1450；从 (500,1450) 起笔的横墙终点吸到洞口边。
  expect(resolveWallPoint([2060,1450],d,0.1,true,[500,1450])).toEqual({point:[2000,1450],target:{wallId:'v',kind:'opening'}});
  expect(resolveWallPoint([2060,1450],d,0.1,true,[500,1450],'v').target).toBeUndefined();
  expect(resolveWallPoint([2060,1450],d,0.1,false,[500,1450])).toEqual({point:[2060,1450]});
  // 真实端点比洞口边更远，但优先级更高。
  const near=fixture();near.openings=[{id:'w',wallId:'v',kind:'window',offset:500,width:880}];
  expect(resolveWallPoint([2000,80],near,0.1,true)).toEqual({point:[2000,0],target:{wallId:'v',kind:'endpoint'}});
});
it('拒绝零长度、重叠墙及穿过开口，保留宿主墙',()=>{const d=fixture();expect(()=>validateWallSegment(d,[0,0],[0,0])).toThrow();expect(()=>validateWallSegment(d,[2000,200],[2000,2000])).toThrow();d.openings=[{id:'o',wallId:'v',kind:'door',offset:1000,width:900}];expect(()=>validateWallSegment(d,[0,1000],[2000,1000])).toThrow();expect(()=>validateWallSegment(d,[0,2000],[2000,2000])).not.toThrow();expect(d.walls).toHaveLength(1);});
it('悬停点沿墙按拖动步进移动，靠近终点取终点',()=>{
  const d=fixture();
  expect(resolveWallHover([1950,1823],d,0.1,50).point).toEqual([2000,1800]);
  expect(resolveWallHover([1950,1823],d,0.1,100).point).toEqual([2000,1800]);
  expect(resolveWallHover([1950,1838],d,0.1,50).point).toEqual([2000,1850]);
  const odd={id:'o',a:[0,0] as [number,number],b:[0,3020] as [number,number],thickness:240,kind:'partition' as const};
  expect(steppedPointOnWall([0,3015],odd,50)).toEqual([0,3020]);
  expect(steppedPointOnWall([0,3005],odd,50)).toEqual([0,3000]);
  expect(steppedPointOnWall([0,-50],odd,50)).toEqual([0,0]);
});
it('绘墙落点：无吸附时墙长按步进取整，端点 / 洞口吸附优先',()=>{
  const d=fixture();
  expect(resolveDrawPoint([1234,1010],d,0.1,true,50,[500,1000])).toEqual({point:[1250,1000]});
  expect(resolveDrawPoint([1950,40],d,0.1,true,50,[500,30])).toEqual(resolveWallPoint([1950,40],d,0.1,true,[500,30]));
  d.openings=[{id:'w',wallId:'v',kind:'window',offset:1000,width:900}];
  expect(resolveDrawPoint([2060,1453],d,0.1,true,50)).toEqual(resolveWallPoint([2060,1453],d,0.1,true));
  expect(resolveDrawPoint([512,988],d,0.1,true,50).point).toEqual([500,1000]);
  expect(resolveDrawPoint([512,988],d,0.1,false,50).point).toEqual([500,1000]);
  expect(resolveDrawPoint([1950,2223],d,0.1,true,50)).toEqual({point:[2000,2200],target:{wallId:'v',kind:'intersection'}});
});
