import { Children, isValidElement, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { blankDesign } from '../data/templates';
const hooks = vi.hoisted(() => ({ values: [] as unknown[], index: 0 }));
vi.mock('react', async original => ({ ...await original<typeof import('react')>(), useState: (initial: unknown) => { const i = hooks.index++; if (!(i in hooks.values)) hooks.values[i] = initial; return [hooks.values[i], (next: unknown) => { hooks.values[i] = next; }]; } }));
import { WallSplitDialog } from './WallSplitDialog';
import { WallSplitPreview } from './WallSplitPreview';
function nodes(element: unknown): ReactElement<Record<string, unknown>>[] {
  if (!isValidElement(element)) return [];
  const e = element as ReactElement<Record<string, unknown>>;
  return [e, ...Children.toArray(e.props.children as React.ReactNode).flatMap(nodes)];
}
function harness() {
  const props = { design: blankDesign(), wallId: 'outer-0', onApply: vi.fn(), onClose: vi.fn() };
  const render = () => { hooks.index = 0; return nodes(WallSplitDialog(props)); };
  const click = (label: string) => (render().find(n => n.props.children === label)!.props.onClick as () => void)();
  const input = (id: string, value: string) => (render().find(n => n.props.id === id)!.props.onChange as (e: unknown) => void)({ target: { value } });
  return { ...props, render, click, input };
}
beforeEach(() => { hooks.values = []; hooks.index = 0; });
describe('墙段分割对话框', () => {
  it('预览跟随单点/两点、结果选择及无效草稿，不提交设计', () => {
    const h = harness(), before = JSON.stringify(h.design);
    const preview = () => h.render().find(n => n.type === WallSplitPreview)!.props;
    expect(preview().intervals).toEqual([0, 300, Math.hypot(h.design.walls[0].b[0] - h.design.walls[0].a[0], h.design.walls[0].b[1] - h.design.walls[0].a[1])]);
    h.click('两点分割'); h.input('wall-split-second', '0.8');
    expect((preview().intervals as number[]).slice(1, -1)).toEqual([300, 800]);
    const second = h.render().find(n => Array.isArray(n.props.children) && n.props.children[0] === '第 ' && n.props.children[1] === 2)!;
    (second.props.onClick as () => void)(); expect(preview().selected).toBe(1);
    h.input('wall-split-first', ''); expect(preview().intervals).toEqual([]);
    h.input('wall-split-first', '0.9'); expect(preview().intervals).toEqual([]);
    expect(h.onApply).not.toHaveBeenCalled(); expect(JSON.stringify(h.design)).toBe(before);
  });
  it('单点默认300mm，输入和子段选择只更新草稿', () => {
    const h = harness(); h.input('wall-split-first', '0.4'); expect(h.onApply).not.toHaveBeenCalled();
    const second = h.render().find(n => Array.isArray(n.props.children) && n.props.children[0] === '第 ' && n.props.children[1] === 2)!;
    (second.props.onClick as () => void)(); h.click('应用分割'); expect(h.onApply).toHaveBeenCalledWith([400], 1);
  });
  it('两点米制提交、取消和Escape均不提交', () => {
    const h = harness(); h.click('两点分割'); h.input('wall-split-first', '0.3'); h.input('wall-split-second', '0.8'); h.click('应用分割');
    expect(h.onApply).toHaveBeenCalledWith([300, 800], 0);
    h.onApply.mockClear(); h.click('取消'); expect(h.onClose).toHaveBeenCalledOnce();
    (h.render()[0].props.onOpenChange as (open: boolean) => void)(false); expect(h.onClose).toHaveBeenCalledTimes(2); expect(h.onApply).not.toHaveBeenCalled();
  });
  it('非法输入禁用，过期模型错误保留提示', () => {
    const h = harness(); h.input('wall-split-first', ''); expect(h.render().find(n => n.props.children === '应用分割')!.props.disabled).toBe(true);
    h.input('wall-split-first', '0.3'); h.onApply.mockImplementation(() => { throw new Error('设计已变化'); }); h.click('应用分割');
    expect(h.render().some(n => n.props.role === 'alert' && n.props.children === '设计已变化')).toBe(true);
  });
});
