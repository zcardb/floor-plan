import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(()=>({values:[] as unknown[],cursor:0}));
vi.mock('react',async original=>({...await original<typeof import('react')>(),useState:(initial:unknown)=>{
  const index=state.cursor++;
  if(!(index in state.values))state.values[index]=initial;
  return [state.values[index],(value:unknown)=>{state.values[index]=value;}];
}}));
import { Library } from './Library';
import { BrickWall } from 'lucide-react';
type Node=ReactElement<Record<string,unknown>>;
function nodes(tree:ReactNode):Node[]{
  if(Array.isArray(tree))return tree.flatMap(nodes);
  if(!isValidElement<Record<string,unknown>>(tree))return [];
  return [tree,...nodes(tree.props.children as ReactNode)];
}
function harness(structureTools=true){
  const add=vi.fn(),setTool=vi.fn();
  const render=()=>{state.cursor=0;return nodes(Library({add,setTool,structureTools}));};
  return {render,add,setTool};
}
beforeEach(()=>{state.values=[];state.cursor=0;});
describe('硬装分类入口',()=>{
  it('硬装有独立图标，切换后集中显示工具与楼梯且移除软装列表',()=>{
    const h=harness();
    let tree=h.render();
    const category=tree.find(n=>n.type==='button'&&Array.isArray(n.props.children)&&n.props.children.includes('硬装'))!;
    expect(nodes(category).some(n=>n.type===BrickWall)).toBe(true);
    expect(tree.some(n=>n.props.className==='structural-items')).toBe(false);
    (category.props.onClick as ()=>void)();tree=h.render();
    expect(tree.some(n=>n.props.className==='structural-items')).toBe(true);
    const item=tree.find(n=>n.props['aria-label']==='添加楼梯')!;
    (item.props.onClick as ()=>void)();
    expect(h.add).toHaveBeenCalledWith(expect.objectContaining({name:'楼梯',w:1000,d:3000}));
    expect(tree.some(n=>n.props['aria-label']==='添加三人沙发')).toBe(false);
    expect(tree.some(n=>n.type==='button'&&Array.isArray(n.props.children)&&n.props.children.includes('墙体'))).toBe(false);
    for(const [label,tool] of [['门','door'],['窗','window']]){
      const button=tree.find(n=>n.type==='button'&&Array.isArray(n.props.children)&&n.props.children.includes(label))!;
      (button.props.onClick as ()=>void)();expect(h.setTool).toHaveBeenLastCalledWith(tool);
    }
  });
  it('搜索楼梯跨分类可添加，只读预览不开放墙门窗工具',()=>{
    const h=harness(false);
    let tree=h.render();
    const search=tree.find(n=>n.type==='input'&&n.props['aria-label']==='搜索家具')!;
    (search.props.onChange as (event:{target:{value:string}})=>void)({target:{value:'楼梯'}});
    tree=h.render();
    expect(tree.some(n=>n.props['aria-label']==='添加楼梯')).toBe(true);
    expect(tree.some(n=>n.props.className==='structural-items')).toBe(false);
  });
});
describe('家具库引导提示',()=>{
  it('提示位于列表标题上方，卡片不再输出 + 徽标且整卡仍可添加',()=>{
    const h=harness();
    const tree=h.render();
    const tip=tree.findIndex(n=>n.props.className==='library-tip');
    const subheading=tree.findIndex(n=>n.props.className==='library-subheading');
    expect(tip).toBeGreaterThan(-1);
    expect(tip).toBeLessThan(subheading);
    expect(tree.some(n=>n.props.className==='item-add')).toBe(false);
    const card=tree.find(n=>n.props['aria-label']==='添加三人沙发')!;
    (card.props.onClick as ()=>void)();
    expect(h.add).toHaveBeenCalledWith(expect.objectContaining({name:'三人沙发'}));
  });
});
