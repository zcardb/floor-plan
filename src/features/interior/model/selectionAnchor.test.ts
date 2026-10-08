import {it,expect} from 'vitest';
import {placeEditor,selectionPoints} from './selectionAnchor';
import {blankDesign} from '../data/templates';
import {editSelection} from './selectionEdits';
it('跟随A/B的位置而非固定坐标',()=>{const a=placeEditor({left:10,top:80,right:60,bottom:120},{width:800,height:600},{width:300,height:50})!,b=placeEditor({left:350,top:180,right:400,bottom:220},{width:800,height:600},{width:300,height:50})!;expect(a.x).not.toBe(b.x);expect(a.y).not.toBe(b.y);});
it('靠近边界翻转且保持在画布内，离屏隐藏',()=>{const p=placeEditor({left:340,top:700,right:385,bottom:760},{width:390,height:844},{width:370,height:80})!;expect(p.x).toBeGreaterThanOrEqual(10);expect(p.x+370).toBeLessThanOrEqual(380);expect(p.y+80).toBeLessThanOrEqual(834);expect(placeEditor({left:500,top:10,right:600,bottom:100},{width:390,height:844},{width:300,height:50})).toBeNull();});
it('旋转家具角点更新，参考墙禁止几何调整',()=>{const d=blankDesign();d.furniture.push({id:'f',type:'table',name:'桌',w:1000,d:500,cx:1000,cy:1000,rot:90,color:'#ffffff'});const points=selectionPoints(d,{kind:'furniture',id:'f'});expect(Math.max(...points.map(p=>p[0]))-Math.min(...points.map(p=>p[0]))).toBeCloseTo(500);expect(()=>editSelection(d,{kind:'wall',id:'outer-0'},{length:1000})).toThrow();expect(()=>editSelection(d,{kind:'furniture',id:'f'},{w:-2})).toThrow();});
