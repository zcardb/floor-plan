import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { matchFurnitureType, resolvedFurnitureType, appearanceDimensions, filterFurnitureLibrary, needsParameterOnly } from './furnitureAppearance';
import { accountCostEntries, filterCostEntries } from './accountCostEntries';
import { blankDesign } from '../data/templates';
import { library } from '../data/catalog';
import { validateDesign } from './validation';
import { FurnitureShape } from '../components/FurnitureShape';
import { buildFurniture } from '../scene/furniture';
import { decorStyleById, furnitureLook } from './decorStyles';
import type { Furniture } from './types';
import type { Mesh } from 'three';
const item = {catalogId:'custom-fire',name:'火炉',category:'客厅',type:'fireplace',shape:'circle' as const,w:600,d:600,height:800,color:'#525252',price:200};
describe('家具外观和成本分类',()=>{
  it('火炉不是沙发或燃气灶，未知为通用物件，手选优先',()=>{
    expect(matchFurnitureType('火炉')).toBe('fireplace');
    expect(matchFurnitureType('圆桌')).toBe('roundtable');
    expect(matchFurnitureType('沙发')).toBe('sofa');
    expect(matchFurnitureType('特殊摆件')).toBe('generic');
    expect(resolvedFurnitureType('火炉','roundtable')).toBe('roundtable');
    expect(needsParameterOnly(item)).toBe(true);
    expect(needsParameterOnly({type:'sofa'})).toBe(false);
  });
  it('圆形直径产生相同宽深，矩形保留独立深度',()=>{
    expect(appearanceDimensions('circle',50,100)).toEqual({w:50,d:50});
    expect(appearanceDimensions('circle',20000,100)).toEqual({w:20000,d:20000});
    expect(appearanceDimensions('rectangle',600,900)).toEqual({w:600,d:900});
  });
  it('自定义来源与搜索共同生效，不引入内置款式',()=>{
    const merged=[item,...library],ids=new Set([item.catalogId]);
    expect(filterFurnitureLibrary(merged,ids,'自定义','')).toEqual([item]);
    expect(filterFurnitureLibrary(merged,ids,'自定义','床')).toEqual([]);
    expect(filterFurnitureLibrary(merged,new Set(),'自定义','')).toEqual([]);
  });
  it('新类型形状可JSON往返，非法外形拒绝，旧家具仍可读',()=>{
    const design={...blankDesign(),customCatalog:[item],furniture:[{...item,id:'fire',cx:0,cy:0,rot:0}]};
    expect(validateDesign(JSON.parse(JSON.stringify(design))).customCatalog?.[0].shape).toBe('circle');
    expect(()=>validateDesign({...design,customCatalog:[{...item,shape:'triangle'}]})).toThrow();
    expect(()=>validateDesign(blankDesign())).not.toThrow();
  });
  it('硬装与软装筛选隔离且保留家电',()=>{
    const entries=accountCostEntries([item],{});
    expect(filterCostEntries(entries,'全部','','硬装').every(e=>['地面','墙面','门窗','屋面','吊顶','楼梯'].includes(e.category))).toBe(true);
    expect(filterCostEntries(entries,'家电','','软装').length).toBeGreaterThan(0);
    expect(filterCostEntries(entries,'全部','火炉','硬装')).toEqual([]);
    expect(filterCostEntries(entries,'全部','火炉','软装')).toHaveLength(1);
  });
  it('2D圆形是椭圆轮廓，3D圆形使用圆柱且火炉有独立构造',()=>{
    const html=renderToStaticMarkup(createElement('svg',null,createElement(FurnitureShape,{f:{...item,type:'generic'}})));
    expect(html).toContain('<ellipse'); expect(html).not.toContain('<rect');
    const build=(f:Furniture)=>buildFurniture(f,furnitureLook(decorStyleById('default'),f));
    const circle=build({...item,type:'generic',id:'circle',cx:0,cy:0,rot:0});
    const rect=build({...item,type:'generic',shape:'rectangle',id:'rect',cx:0,cy:0,rot:0});
    expect(circle.children[0].type).toBe('Mesh');
    // 俯视轮廓：圆柱的顶点不超出直径 600 的圆，方块的四角伸到对角线
    const reach=(g:typeof circle)=>Math.max(...g.children.flatMap(o=>{const p=(o as Mesh).geometry.attributes.position;return Array.from({length:p.count},(_,i)=>Math.hypot(p.getX(i),p.getZ(i)));}));
    expect(reach(circle)).toBeCloseTo(0.3,3);
    expect(reach(rect)).toBeCloseTo(Math.hypot(0.3,0.3),3);
    const fire=build({...item,id:'fire',cx:0,cy:0,rot:0});
    // 同材质子网格会被合并：炉口为独立材质，整体顶点数多于普通圆柱
    const verts=(g:typeof fire)=>g.children.reduce((s,o)=>s+((o as unknown as {geometry:{attributes:{position:{count:number}}}}).geometry.attributes.position.count),0);
    expect(fire.children.length).toBe(2);
    expect(verts(fire)).toBeGreaterThan(verts(circle));
  });
});
