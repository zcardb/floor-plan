import { Children, isValidElement, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { blankDesign } from '../data/templates';
import { length } from '../model/geometry';
const hooks = vi.hoisted(() => ({ values: [] as unknown[], index: 0 }));
vi.mock('react', async original => ({ ...await original<typeof import('react')>(), useState: (initial: unknown) => { const i = hooks.index++; if (!(i in hooks.values)) hooks.values[i] = initial; return [hooks.values[i], (next: unknown) => { hooks.values[i] = typeof next === 'function' ? (next as (v: unknown) => unknown)(hooks.values[i]) : next; }]; } }));
import { WallSplitDialog } from './WallSplitDialog';
import { WallSplitPreview } from './WallSplitPreview';
type Node = ReactElement<Record<string, unknown>>;
function nodes(element: unknown): Node[] {
  if (!isValidElement(element)) return [];
  const e = element as Node;
  return [e, ...Children.toArray(e.props.children as React.ReactNode).flatMap(nodes)];
}
function harness() {
  const props = { design: blankDesign(), wallId: 'outer-0', onApply: vi.fn(), onClose: vi.fn() };
  const render = () => { hooks.index = 0; return nodes(WallSplitDialog(props)); };
  const byLabel = (label: string) => render().find(n => n.props['aria-label'] === label || n.props.children === label)!;
  const click = (label: string) => (byLabel(label).props.onClick as () => void)();
  const input = (id: string, value: string) => (render().find(n => n.props.id === id)!.props.onChange as (e: unknown) => void)({ target: { value } });
  const blur = (id: string) => (render().find(n => n.props.id === id)!.props.onBlur as () => void)();
  const preview = () => render().find(n => n.type === WallSplitPreview)!.props;
  return { ...props, L: length(props.design.walls[0]), render, byLabel, click, input, blur, preview };
}
beforeEach(() => { hooks.values = []; hooks.index = 0; });
describe('墙段分割对话框', () => {
  it('预览跟随单点/两点、结果选择及无效草稿，不提交设计', () => {
    const h = harness(), before = JSON.stringify(h.design);
    expect(h.preview().intervals).toEqual([0, 300, h.L]);
    h.click('两点分割'); h.input('wall-split-second', '0.8');
    expect((h.preview().intervals as number[]).slice(1, -1)).toEqual([300, 800]);
    h.click('选中第 2 段'); expect(h.preview().selected).toBe(1);
    h.input('wall-split-first', ''); expect(h.preview().intervals).toEqual([]);
    expect(h.onApply).not.toHaveBeenCalled(); expect(JSON.stringify(h.design)).toBe(before);
  });
  it('交换A/B保留数字、反向提交并映射选中段，两次交换恢复', () => {
    const h = harness(); h.click('两点分割'); h.input('wall-split-second', '0.8');
    h.click('交换 A/B');
    expect(h.preview().reversed).toBe(true); expect(h.render().find(n => n.props.id === 'wall-split-first')!.props.value).toBe('0.30');
    expect((h.preview().intervals as number[]).slice(1, -1)).toEqual([h.L - 800, h.L - 300]);
    expect(h.preview().selected).toBe(2);
    h.click('应用分割'); expect(h.onApply).toHaveBeenCalledWith([h.L - 800, h.L - 300], 2);
    h.click('交换 A/B'); expect(h.preview().reversed).toBe(false); expect((h.preview().intervals as number[]).slice(1, -1)).toEqual([300, 800]);
  });
  it('单点选中第2段提交原方向参数', () => {
    const h = harness(); h.input('wall-split-first', '0.4'); h.click('选中第 2 段'); h.click('应用分割');
    expect(h.onApply).toHaveBeenCalledWith([400], 1);
  });
  it('编辑中空值仅提示，失焦后显示关联错误；取消和关闭不提交', () => {
    const h = harness(); h.input('wall-split-first', '');
    expect(h.render().some(n => n.props.role === 'alert')).toBe(false);
    expect(h.byLabel('应用分割').props.disabled).toBe(true);
    h.blur('wall-split-first');
    const field = h.render().find(n => n.props.id === 'wall-split-first')!;
    expect(field.props['aria-invalid']).toBe(true); expect(field.props['aria-describedby']).toBe('wall-split-error');
    h.click('取消'); (h.render()[0].props.onOpenChange as (open: boolean) => void)(false);
    expect(h.onClose).toHaveBeenCalledTimes(2); expect(h.onApply).not.toHaveBeenCalled();
  });
  it('过期模型错误保留提示', () => {
    const h = harness(); h.onApply.mockImplementation(() => { throw new Error('设计已变化'); }); h.click('应用分割');
    expect(h.render().some(n => n.props.role === 'alert' && n.props.children === '设计已变化')).toBe(true);
  });
});
