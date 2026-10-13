import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ values: [] as unknown[], refs: [] as { current: unknown }[], cursor: 0, refCursor: 0, cleanups: [] as (() => void)[], effectsRun: false }));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const index = state.cursor++;
    if (!(index in state.values)) state.values[index] = initial;
    return [state.values[index], (value: unknown) => { state.values[index] = value; }];
  },
  useRef: (initial: unknown) => {
    const index = state.refCursor++;
    if (!(index in state.refs)) state.refs[index] = { current: initial };
    return state.refs[index];
  },
  useEffect: (effect: () => void | (() => void)) => {
    if (state.effectsRun) return;
    const cleanup = effect();
    if (cleanup) state.cleanups.push(cleanup);
  },
  useImperativeHandle: () => {},
}));
const notify = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn(), error: vi.fn(), fail: vi.fn(), info: vi.fn() }));
vi.mock('@/lib/notify', () => ({ notify }));

import { PriceInput, type PriceApplyResult } from './PriceInput';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

type Node = ReactElement<Record<string, unknown>>;
function nodes(tree: ReactNode): Node[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!isValidElement<Record<string, unknown>>(tree)) return [];
  return [tree, ...nodes(tree.props.children as ReactNode)];
}
function harness(onApply: (v: number | null) => PriceApplyResult) {
  const render = () => {
    state.cursor = 0; state.refCursor = 0;
    const tree = nodes(PriceInput({ value: 50, label: '吊顶账号默认单价', onApply }));
    state.effectsRun = true;
    return tree;
  };
  const unmount = () => state.cleanups.splice(0).forEach(cleanup => cleanup());
  const type = (text: string) => (render().find(n => n.type === Input)!.props.onChange as (e: { target: { value: string } }) => void)({ target: { value: text } });
  const clickApply = () => (render().find(n => n.type === Button)!.props.onClick as () => void)();
  return { render, unmount, type, clickApply };
}
beforeEach(() => {
  Object.assign(state, { values: [], refs: [], cursor: 0, refCursor: 0, cleanups: [], effectsRun: false });
  Object.values(notify).forEach(fn => fn.mockClear());
});

describe('PriceInput 提示去重', () => {
  it('应用时父级立即更新价格并重挂载输入框，只提示一次「已更新」', async () => {
    let unmount = () => {};
    const h = harness(() => { unmount(); return Promise.resolve(true); });
    unmount = h.unmount;
    h.type('70');
    h.clickApply();
    await vi.waitFor(() => expect(notify.success).toHaveBeenCalledTimes(1));
    expect(notify.warning).not.toHaveBeenCalled();
  });

  it('应用失败后关闭，未保存的修改仍提示已放弃', async () => {
    const h = harness(() => false);
    h.type('70');
    h.clickApply();
    await Promise.resolve(); await Promise.resolve();
    h.render();
    h.unmount();
    expect(notify.success).not.toHaveBeenCalled();
    expect(notify.warning).toHaveBeenCalledTimes(1);
  });

  it('未点应用直接关闭，提示已放弃', () => {
    const h = harness(() => true);
    h.type('70');
    h.render();
    h.unmount();
    expect(notify.warning).toHaveBeenCalledTimes(1);
  });
});

describe('PriceInput 键盘', () => {
  const key = (h: ReturnType<typeof harness>, k: string) => {
    const event = { key: k, preventDefault: vi.fn(), stopPropagation: vi.fn(), nativeEvent: { isComposing: false } };
    (h.render().find(n => n.type === Input)!.props.onKeyDown as (e: typeof event) => void)(event);
    return event;
  };
  it('回车直接应用：不用再点按钮', async () => {
    const onApply = vi.fn(() => true);
    const h = harness(onApply);
    h.type('80');
    expect(key(h, 'Enter').preventDefault).toHaveBeenCalled();
    expect(onApply).toHaveBeenCalledWith(80);
    await vi.waitFor(() => expect(notify.success).toHaveBeenCalledTimes(1));
  });
  it('Esc 还原草稿，不应用', () => {
    const onApply = vi.fn(() => true);
    const h = harness(onApply);
    h.type('80');
    key(h, 'Escape');
    expect(h.render().find(n => n.type === Input)!.props.value).toBe('50');
    expect(onApply).not.toHaveBeenCalled();
  });
});
