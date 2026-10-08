import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0, mounted: false, cleanup: undefined as undefined | (() => void) }));
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useState(initial: unknown) {
    const index = harness.cursor++;
    if (!(index in harness.slots)) harness.slots[index] = initial;
    return [harness.slots[index], (next: unknown) => { harness.slots[index] = next; }];
  },
  useEffect(effect: () => (() => void)) {
    if (!harness.mounted) { harness.mounted = true; harness.cleanup = effect(); }
  },
}));
import { ManagementEntry } from './ManagementEntry';
import { ManagementLoading } from './ManagementLoading';

beforeEach(() => { harness.slots = []; harness.cursor = 0; harness.mounted = false; harness.cleanup = undefined; });
const content = createElement('div', null, '管理内容');
function setup(load?: () => Promise<void>) {
  const reset = vi.fn();
  return { reset, render: (loading: boolean) => { harness.cursor = 0; return ManagementEntry({ loading, label: '加载家具', load, reset, children: content }); } };
}
describe('管理菜单进入骨架', () => {
  it('首帧等待目录启动，目录与成本均结束才显示内容', async () => {
    let done!: () => void;
    const load = vi.fn(() => new Promise<void>(resolve => { done = resolve; }));
    const { render } = setup(load);
    expect(render(false)).toMatchObject({ type: ManagementLoading, props: { heading: true } });
    expect(render(true)).toMatchObject({ type: ManagementLoading });
    done(); await Promise.resolve();
    expect(render(true)).toMatchObject({ type: ManagementLoading });
    expect(render(false)).toBe(content);
    expect(load).toHaveBeenCalledTimes(1);
  });
  it('成本先完成而目录仍在请求时不会提前展示', () => {
    const { render } = setup(() => new Promise<void>(() => {}));
    expect(render(true)).toMatchObject({ type: ManagementLoading });
    expect(render(false)).toMatchObject({ type: ManagementLoading });
  });
  it('项目首次初始化等待结束；就绪缓存直接显示', () => {
    const { render } = setup();
    expect(render(true)).toMatchObject({ type: ManagementLoading });
    expect(render(false)).toBe(content);
  });
  it('展示后刷新、分页、打开项目不再卸载内容', () => {
    const { render } = setup();
    expect(render(false)).toBe(content);
    expect(render(true)).toBe(content);
    expect(render(false)).toBe(content);
  });
  it('失败由读取层处理并结束请求后展示错误所在页面', async () => {
    const { render } = setup(async () => {});
    render(true); await Promise.resolve();
    expect(render(false)).toBe(content);
  });
  it('离开后清理目录，旧请求完成不会更新新入口', async () => {
    let done!: () => void;
    const { render, reset } = setup(() => new Promise<void>(resolve => { done = resolve; }));
    render(false); harness.cleanup?.();
    done(); await Promise.resolve();
    expect(reset).toHaveBeenCalledTimes(1);
    expect(harness.slots[0]).toBe(false);
  });
});
