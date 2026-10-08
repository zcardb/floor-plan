import {it,expect} from 'vitest';
import {blankDesign} from '../data/templates';
import {createSizeTransaction} from './sizeTransaction';
import {createProject} from '../data/templates';

it('旋转快捷键前 flush 提交有效角度，非法草稿恢复原角度',()=>{
  let d=createProject('reference').state;
  const id=d.furniture[0].id,original=d.furniture[0].rot;
  let commits=0;
  const tx=createSizeTransaction(()=>d,next=>{d=next;},next=>{d=next;commits++;});
  let token=tx.begin({kind:'furniture',id});
  tx.update(token,{rot:'45'});
  expect(tx.flush()).toBe(true);
  expect(d.furniture[0].rot).toBe(45);
  expect(commits).toBe(1);
  token=tx.begin({kind:'furniture',id});
  tx.update(token,{rot:'90'});
  expect(()=>tx.update(token,{rot:''})).toThrow();
  expect(tx.flush()).toBe(false);
  expect(d.furniture[0].rot).toBe(45);
  expect(commits).toBe(1);
  expect(Number.isFinite(original)).toBe(true);
});
it('有效输入预览无保存，应用只提交一次，取消恢复',()=>{let d=blankDesign();d.openings=[{id:'o',wallId:d.walls[0].id,kind:'door',width:900,offset:2000}];const before=d;let saves=0;const tx=createSizeTransaction(()=>d,next=>{d=next;},(next,old)=>{expect(old).toBe(before);d=next;saves++;});let token=tx.begin({kind:'opening',id:'o'});tx.update(token,{width:'1200'});expect(d.openings[0].width).toBe(1200);expect(saves).toBe(0);tx.cancel(token);expect(d).toBe(before);token=tx.begin({kind:'opening',id:'o'});tx.update(token,{width:'1200'});expect(tx.apply(token)).toBe(true);expect(tx.apply(token)).toBe(false);expect(saves).toBe(1);});
it('非法输入保留最后有效预览，旧事务不能覆盖新编辑',()=>{let d=blankDesign();const tx=createSizeTransaction(()=>d,next=>{d=next;},next=>{d=next;});d.openings=[{id:'o',wallId:d.walls[0].id,kind:'door',width:900,offset:2000}];const t=tx.begin({kind:'opening',id:'o'});tx.update(t,{width:'1200'});expect(()=>tx.update(t,{width:''})).toThrow();expect(d.openings[0].width).toBe(1200);const newer={...d,height:4000};d=newer;tx.cancel(t);expect(d).toBe(newer);});
it('门窗加宽碰到墙端时整体平移，宽度立即生效',()=>{let d=blankDesign();const L=Math.hypot(d.walls[0].b[0]-d.walls[0].a[0],d.walls[0].b[1]-d.walls[0].a[1]);d.openings=[{id:'o',wallId:d.walls[0].id,kind:'window',width:1000,offset:600}];const tx=createSizeTransaction(()=>d,next=>{d=next;},next=>{d=next;});const t=tx.begin({kind:'opening',id:'o'});tx.update(t,{width:'2000'});expect(d.openings[0].width).toBe(2000);expect(d.openings[0].offset).toBe(1000);expect(()=>tx.update(t,{width:String(L+10)})).toThrow('门窗宽度超过所在墙段长度');});
