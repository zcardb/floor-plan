import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(()=>({values:[] as unknown[],cursor:0}));
vi.mock('react',async original=>({...await original<typeof import('react')>(),useState:(initial:unknown)=>{
  const index=state.cursor++;
  if(!(index in state.values))state.values[index]=initial;
  return [state.values[index],(value:unknown)=>{state.values[index]=value;}];
}}));
import { Library, LIBRARY_PAGE_SIZE, StructuralItems } from './Library';
import { CmsFilterBar } from './CmsFilterBar';
import { ProjectLoadMore } from './ProjectLoadMore';
import { library } from '../data/catalog';
type Node=ReactElement<Record<string,unknown>>;
function nodes(tree:ReactNode):Node[]{
  if(Array.isArray(tree))return tree.flatMap(nodes);
  if(!isValidElement<Record<string,unknown>>(tree))return [];
  if(tree.type===StructuralItems)return nodes(StructuralItems(tree.props as Parameters<typeof StructuralItems>[0]));
  return [tree,...nodes(tree.props.children as ReactNode)];
}
function text(tree:ReactNode):string{
  if(typeof tree==='string'||typeof tree==='number')return String(tree);
  if(Array.isArray(tree))return tree.map(text).join('');
  return isValidElement<{children?:ReactNode}>(tree)?text(tree.props.children):'';
}
function harness(structureTools=true){
  const add=vi.fn(),setTool=vi.fn();
  const render=()=>{state.cursor=0;return nodes(Library({add,setTool,structureTools}));};
  return {render,add,setTool};
}
beforeEach(()=>{state.values=[];state.cursor=0;});
type Bar=Parameters<typeof CmsFilterBar>[0];
const barOf=(tree:Node[])=>tree.find(n=>n.type===CmsFilterBar)!.props as unknown as Bar;
describe('硬装分类入口',()=>{
  it('硬装切换后集中显示五种楼梯与工具，并移除软装列表',()=>{
    const h=harness();
    let tree=h.render();
    expect(tree.some(n=>n.props.className==='structural-items')).toBe(false);
    barOf(tree).onChange('硬装');tree=h.render();
    expect(tree.some(n=>n.props.className==='structural-items')).toBe(true);
    for(const name of ['直跑楼梯','L 型楼梯','U 型楼梯','三跑楼梯','螺旋楼梯'])
      expect(tree.some(n=>n.props['aria-label']==='添加'+name),name).toBe(true);
    const item=tree.find(n=>n.props['aria-label']==='添加直跑楼梯')!;
    (item.props.onClick as ()=>void)();
    expect(h.add).toHaveBeenCalledWith(expect.objectContaining({name:'直跑楼梯',w:1000,d:4480,stair:expect.objectContaining({form:'straight',flightWidth:1000,steps:16})}));
    expect(tree.some(n=>n.props['aria-label']==='添加三人沙发')).toBe(false);
    expect(tree.some(n=>n.type==='button'&&text(n.props.children as ReactNode)==='墙体')).toBe(false);
    expect(tree.filter(n=>n.type==='h4').map(n=>n.props.children)).toEqual(['墙','门窗']);
    for(const [label,tool] of [['墙','wall'],['垭口','passage'],['房间分隔线','separator'],['门','door'],['窗','window']]){
      const button=tree.find(n=>n.type==='button'&&(Array.isArray(n.props.children)?n.props.children.includes(label):n.props.children===label))!;
      expect(button,label).toBeDefined();
      (button.props.onClick as ()=>void)();expect(h.setTool).toHaveBeenLastCalledWith(tool);
    }
  });
  it('搜索楼梯跨分类可添加，只读预览不开放墙门窗工具',()=>{
    const h=harness(false);
    let tree=h.render();
    const search=tree.find(n=>n.type==='input'&&n.props['aria-label']==='搜索家具')!;
    (search.props.onChange as (event:{target:{value:string}})=>void)({target:{value:'楼梯'}});
    tree=h.render();
    expect(tree.some(n=>n.props['aria-label']==='添加U 型楼梯')).toBe(true);
    expect(tree.some(n=>n.props.className==='structural-items')).toBe(false);
  });
});
describe('家具库头部与引导提示',()=>{
  it('头部（搜索 + 新建、通用分类胶囊、分组小标题）固定，只有列表区滚动',()=>{
    const h=harness();
    const tree=h.render();
    const head=tree.find(n=>n.props.className==='library-head')!;
    const inHead=nodes(head);
    const toolbar=inHead.findIndex(n=>n.props.className==='library-toolbar');
    const categories=inHead.findIndex(n=>n.type===CmsFilterBar);
    const subheading=inHead.findIndex(n=>n.props.className==='library-subheading');
    expect(toolbar).toBeGreaterThan(-1);
    expect(toolbar).toBeLessThan(categories);
    expect(categories).toBeLessThan(subheading);
    expect(text(inHead[subheading]!.props.children as ReactNode)).toContain('点击添加或拖入');
    // 家具卡片只在滚动区里
    const scroll=tree.find(n=>n.props.className==='library-scroll')!;
    expect(nodes(head).some(n=>n.props.className==='library-item')).toBe(false);
    expect(nodes(scroll).some(n=>n.props.className==='library-item')).toBe(true);
    // 分类沿用管理页的 CmsFilterBar，紧凑尺寸，第一项是默认选中的「全部」
    const bar=barOf(tree);
    expect(bar.className).toBe('library-categories');
    expect(bar.chips.map(c=>c.label)).toEqual(['全部','卧室','客厅','餐厨','卫浴','家电','书房','硬装']);
    expect(bar.value).toBe('全部');
  });
  it('「全部」按 12 件一页滚动加载：12 → 24 → 36',()=>{
    const h=harness();
    let tree=h.render();
    const cards=()=>tree.filter(n=>n.props.className==='library-item').length;
    expect(text(tree.find(n=>n.props.className==='library-subheading')!.props.children as ReactNode)).toContain(`全部家具 · ${library.length} 件`);
    expect(cards()).toBe(LIBRARY_PAGE_SIZE);
    for(const expected of [24,36]){
      const more=tree.find(n=>n.type===ProjectLoadMore)!.props as Parameters<typeof ProjectLoadMore>[0];
      expect(more.total).toBe(library.length);
      more.onReach();tree=h.render();
      expect(cards()).toBe(Math.min(expected,library.length));
    }
    // 切换分类后回到第一页
    barOf(tree).onChange('客厅');tree=h.render();
    expect(cards()).toBeLessThanOrEqual(LIBRARY_PAGE_SIZE);
    expect(tree.every(n=>n.props.className!=='library-item'||library.find(i=>'添加'+i.name===n.props['aria-label'])?.category==='客厅')).toBe(true);
    const card=tree.find(n=>n.props['aria-label']==='添加三人沙发')!;
    (card.props.onClick as ()=>void)();
    expect(h.add).toHaveBeenCalledWith(expect.objectContaining({name:'三人沙发'}));
  });
  it('登录可编辑时右侧有 32px 新建按钮，只读或未登录时不显示',()=>{
    const add=vi.fn(),setTool=vi.fn(),onNew=vi.fn();
    const withNew=nodes(Library({add,setTool,structureTools:true,onNew}));
    const button=withNew.find(n=>n.props.className==='library-new')!;
    expect(button.props['aria-label']).toBe('新建家具 / 账号库');
    (button.props.onClick as ()=>void)();
    expect(onNew).toHaveBeenCalledOnce();
    expect(nodes(Library({add,setTool,structureTools:true})).some(n=>n.props.className==='library-new')).toBe(false);
  });
});
