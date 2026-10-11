import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(()=>({values:[] as unknown[],cursor:0}));
vi.mock('react',async original=>({...await original<typeof import('react')>(),useState:(initial:unknown)=>{
  const index=state.cursor++;
  if(!(index in state.values))state.values[index]=initial;
  return [state.values[index],(value:unknown)=>{state.values[index]=value;}];
}}));
import { Library, StructuralItems } from './Library';
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
describe('硬装分类入口',()=>{
  it('硬装有独立图标，切换后集中显示五种楼梯与工具，并移除软装列表',()=>{
    const h=harness();
    let tree=h.render();
    const category=tree.find(n=>n.type==='button'&&n.props.children==='硬装')!;
    // 分类已收成一行胶囊：不再有图标，只有文字与选中态
    expect(nodes(category).some(n=>typeof n.type==='string'&&n.type==='svg')).toBe(false);
    expect(tree.some(n=>n.props.className==='structural-items')).toBe(false);
    (category.props.onClick as ()=>void)();tree=h.render();
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
  it('搜索框与新建按钮同一行，分类是一行胶囊，操作提示并入分组小标题',()=>{
    const h=harness();
    const tree=h.render();
    const toolbar=tree.findIndex(n=>n.props.className==='library-toolbar');
    const categories=tree.findIndex(n=>n.props.className==='library-categories');
    const subheading=tree.findIndex(n=>n.props.className==='library-subheading');
    expect(toolbar).toBeGreaterThan(-1);
    expect(toolbar).toBeLessThan(categories);
    expect(categories).toBeLessThan(subheading);
    // 提示卡片已并入分组小标题的右侧灰字
    expect(tree.some(n=>n.props.className==='library-tip')).toBe(false);
    expect(text(tree[subheading]!.props.children as ReactNode)).toContain('点击添加或拖入');
    // 分类胶囊是纯文字按钮，当前项用 aria-pressed 表达
    const bar=tree.find(n=>n.props.className==='library-categories')!;
    const chips=nodes(bar).filter(n=>typeof n.props['aria-pressed']==='boolean');
    expect(chips.map(n=>n.props.children)).toEqual(['卧室','客厅','餐厨','卫浴','家电','书房','硬装']);
    expect(chips.filter(n=>n.props['aria-pressed']).map(n=>n.props.children)).toEqual(['客厅']);
    expect(tree.some(n=>n.props.className==='item-add')).toBe(false);
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
