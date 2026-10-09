import { Children, isValidElement, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { blankDesign } from '../data/templates';
import { length } from '../model/geometry';
import type { Design } from '../model/types';
const hooks = vi.hoisted(() => ({ values: [] as unknown[], index: 0 }));
vi.mock('react', async original => ({ ...await original<typeof import('react')>(), useMemo: (fn: () => unknown) => fn(), useState: (initial: unknown) => { const i = hooks.index++; if (!(i in hooks.values)) hooks.values[i] = typeof initial === 'function' ? (initial as () => unknown)() : initial; return [hooks.values[i], (next: unknown) => { hooks.values[i] = typeof next === 'function' ? (next as (v: unknown) => unknown)(hooks.values[i]) : next; }]; } }));
import { WallSplitDialog } from './WallSplitDialog';
import { WallSplitPreview } from './WallSplitPreview';
type Node = ReactElement<Record<string, unknown>>;
function nodes(element: unknown): Node[] {
  if (!isValidElement(element)) return [];
  const e = element as Node;
  return [e, ...Children.toArray(e.props.children as React.ReactNode).flatMap(nodes)];
}
function harness(design: Design = blankDesign(), wallId = 'outer-0') {
  const props = { design, wallId, onApply: vi.fn(), onClose: vi.fn() };
  const render = () => { hooks.index = 0; return nodes(WallSplitDialog(props)); };
  const byLabel = (label: string) => render().find(n => n.props['aria-label'] === label || n.props.children === label)!;
  const click = (label: string) => (byLabel(label).props.onClick as () => void)();
  const input = (id: string, value: string) => (render().find(n => n.props.id === id)!.props.onChange as (e: unknown) => void)({ target: { value } });
  const blur = (id: string) => (render().find(n => n.props.id === id)!.props.onBlur as () => void)();
  const focus = (id: string) => (render().find(n => n.props.id === id)!.props.onFocus as () => void)();
  const value = (id: string) => render().find(n => n.props.id === id)!.props.value;
  const preview = () => render().find(n => n.type === WallSplitPreview)!.props;
  return { ...props, L: length(design.walls.find(w => w.id === wallId)!), render, byLabel, click, input, blur, focus, value, preview };
}
/** A 6 m wall along +x with partitions meeting it at 1 m (T), 2.5 m (inside a window) and 4 m (crossing). */
function junctions(): Design {
  return { ...blankDesign(), rooms: [], walls: [
    { id: 'host', kind: 'partition', thickness: 240, a: [0, 0], b: [6000, 0] },
    { id: 't1', kind: 'partition', thickness: 120, a: [1000, 0], b: [1000, 2000] },
    { id: 't2', kind: 'partition', thickness: 120, a: [2500, 0], b: [2500, 2000] },
    { id: 'x', kind: 'partition', thickness: 120, a: [4000, -1500], b: [4000, 1500] },
  ], openings: [{ id: 'win', wallId: 'host', kind: 'window', offset: 2500, width: 900 }] };
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
describe('接触点分割', () => {
  it('列出全部接触点：洞口内的禁用，可用的默认全选并一次提交', () => {
    const h = harness(junctions(), 'host'), before = JSON.stringify(h.design);
    h.click('接触点分割');
    expect(h.byLabel('接触点 1').props['aria-pressed']).toBe(true);
    expect(h.byLabel('接触点 2（位于门窗洞口内）').props.disabled).toBe(true);
    expect(h.byLabel('接触点 2（位于门窗洞口内）').props['aria-pressed']).toBe(false);
    expect(h.byLabel('接触点 3').props['aria-pressed']).toBe(true);
    expect(h.preview().intervals).toEqual([0, 1000, 4000, 6000]);
    expect(h.preview().contacts).toHaveLength(3);
    expect(h.render().some(n => n.props.children === '十字穿过')).toBe(true);
    h.click('选中第 2 段'); h.click('应用分割');
    expect(h.onApply).toHaveBeenCalledWith([1000, 4000], 1);
    expect(JSON.stringify(h.design)).toBe(before);
  });
  it('取消勾选后预览更新；清空后不能应用，全选恢复', () => {
    const h = harness(junctions(), 'host');
    h.click('接触点分割'); h.click('接触点 1');
    expect(h.preview().intervals).toEqual([0, 4000, 6000]);
    h.click('清空');
    expect(h.preview().intervals).toEqual([]); expect(h.byLabel('应用分割').props.disabled).toBe(true);
    h.click('全选');
    expect(h.preview().intervals).toEqual([0, 1000, 4000, 6000]); expect(h.byLabel('应用分割').props.disabled).toBe(false);
  });
  it('交换 A/B 后勾选不变、距离按新 A 显示，提交仍为存储方向', () => {
    const h = harness(junctions(), 'host');
    h.click('接触点分割'); h.click('交换 A/B');
    expect(h.render().some(n => n.props.children === `接触点 1 · 距 A 5.00 m` || (Array.isArray(n.props.children) && n.props.children.join('') === '接触点 1 · 距 A 5.00 m'))).toBe(true);
    expect(h.preview().intervals).toEqual([0, 1000, 4000, 6000]);
    h.click('应用分割');
    // Card 1 is next to the shown A (stored b), so it maps back to the last stored segment.
    expect(h.onApply).toHaveBeenCalledWith([1000, 4000], 2);
  });
  it('没有相接墙时显示空状态，且不提交', () => {
    const h = harness();
    h.click('接触点分割');
    expect(h.render().some(n => n.props.children === '本墙没有其他墙相接，可使用单点或两点分割')).toBe(true);
    expect(h.byLabel('应用分割').props.disabled).toBe(true);
    expect(h.render().some(n => n.props['aria-label'] === '接触点快捷填入')).toBe(false);
  });
  it('单点/两点模式的快捷标签写入点 1 或最近聚焦的输入框，跳过洞口内的接触点', () => {
    const h = harness(junctions(), 'host');
    expect(h.render().filter(n => n.props.className === 'wall-split-chip')).toHaveLength(2);
    h.click('填入接触点 2 距离');
    expect(h.value('wall-split-first')).toBe('4.00'); expect(h.preview().intervals).toEqual([0, 4000, 6000]);
    h.click('两点分割'); h.input('wall-split-first', '0.5'); h.focus('wall-split-second'); h.click('填入接触点 1 距离');
    expect(h.value('wall-split-second')).toBe('1.00'); expect(h.preview().intervals).toEqual([0, 500, 1000, 6000]);
    h.click('交换 A/B'); h.focus('wall-split-first'); h.click('填入接触点 1 距离');
    expect(h.value('wall-split-first')).toBe('5.00');
  });
});
