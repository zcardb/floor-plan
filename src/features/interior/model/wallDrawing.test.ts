import {it,expect} from 'vitest';
import {blankDesign} from '../data/templates';
import {resolveWallPoint,validateWallSegment} from './wallDrawing';
const fixture=()=>({...blankDesign(),walls:[{id:'v',a:[2000,0] as [number,number],b:[2000,3000] as [number,number],thickness:240,kind:'partition' as const}]});
it('轴向约束先执行，T形吸附最终坐标准确',()=>{const d=fixture();expect(resolveWallPoint([1950,1050],d,0.1,true,[500,1000])).toEqual({point:[2000,1000],target:{wallId:'v',kind:'intersection'}});expect(resolveWallPoint([1600,1050],d,0.1,true,[500,1000]).target).toBeUndefined();});
it('关闭吸附、排除自身、缩放阈值一致',()=>{const d=fixture();expect(resolveWallPoint([1950,1000],d,0.1,false,[500,1000]).point).toEqual([1950,1000]);expect(resolveWallPoint([1950,1000],d,0.1,true,[500,1000],'v').target).toBeUndefined();expect(resolveWallPoint([1800,0],d,0.1,true).target).toBeDefined();expect(resolveWallPoint([1700,0],d,0.1,true).target).toBeUndefined();});
it('拒绝零长度、重叠墙及穿过开口，保留宿主墙',()=>{const d=fixture();expect(()=>validateWallSegment(d,[0,0],[0,0])).toThrow();expect(()=>validateWallSegment(d,[2000,200],[2000,2000])).toThrow();d.openings=[{id:'o',wallId:'v',kind:'door',offset:1000,width:900}];expect(()=>validateWallSegment(d,[0,1000],[2000,1000])).toThrow();expect(()=>validateWallSegment(d,[0,2000],[2000,2000])).not.toThrow();expect(d.walls).toHaveLength(1);});
