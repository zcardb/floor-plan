import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageRequest, PageResult } from '@/lib/paging';

// 极简 Hook 运行时：状态与 ref 按调用顺序占槽位，effect 在依赖变化时同步重跑（先执行上一次的清理函数）。
const rt = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0, effects: [] as { deps?: readonly unknown[]; cleanup?: void | (() => void) }[], effect: 0 }));
vi.mock('react', async (original) => {
  const slot = <T,>(make: () => T): T => {
    const index = rt.cursor++;
    if (!(index in rt.slots)) rt.slots[index] = make();
    return rt.slots[index] as T;
  };
  return {
    ...(await original<typeof import('react')>()),
    useState(initial: unknown) {
      const index = rt.cursor;
      slot(() => (typeof initial === 'function' ? (initial as () => unknown)() : initial));
      return [rt.slots[index], (next: unknown) => { rt.slots[index] = typeof next === 'function' ? (next as (value: unknown) => unknown)(rt.slots[index]) : next; }];
    },
    useRef: (initial: unknown) => slot(() => ({ current: initial })),
    useCallback: (callback: unknown) => slot(() => callback),
    useEffect(effect: () => void | (() => void), deps?: readonly unknown[]) {
      const index = rt.effect++, previous = rt.effects[index];
      if (previous && deps && previous.deps && deps.every((dep, i) => Object.is(dep, previous.deps![i]))) return;
      if (previous?.cleanup) previous.cleanup();
      rt.effects[index] = { deps, cleanup: effect() };
    },
  };
});
vi.mock('@/lib/notify', () => ({ errorMessage: (cause: unknown, fallback: string) => (cause instanceof Error ? cause.message : fallback) }));
import { usePagedList, type PagedListOptions } from '../use-paged-list';

type Options = PagedListOptions<string, string>;
/** 渲染一次：上面的极简运行时里，Hook 按调用顺序占槽位，所以每次调用就是一次渲染。 */
// eslint-disable-next-line react-hooks/rules-of-hooks -- 测试运行时直接调用 Hook，不经过 React 组件
const render = (options: Options) => { rt.cursor = 0; rt.effect = 0; return usePagedList(options); };
/** 等所有已完成的 Promise 回调跑完。 */
const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
const range = (from: number, to: number, prefix = 'r') => Array.from({ length: to - from }, (_, i) => prefix + (from + i));

/** 假接口：共 total 条，记录每次请求；可以指定某次请求失败，或手动控制何时返回。 */
function fakeRemote(total: number, counts: Record<string, number> = {}, prefix = 'r') {
  const calls: PageRequest[] = [];
  const state = { fail: false, total, held: [] as (() => void)[], hold: false };
  const source = ({ page, pageSize }: PageRequest) => {
    calls.push({ page, pageSize });
    const result: PageResult<string, string> = { list: range((page - 1) * pageSize, Math.min(page * pageSize, state.total), prefix), pagination: { page, pageSize, total: state.total }, counts };
    if (state.fail) return Promise.reject(new Error('网络异常'));
    if (!state.hold) return Promise.resolve(result);
    return new Promise<PageResult<string, string>>((resolve) => state.held.push(() => resolve(result)));
  };
  return { source, calls, state };
}

beforeEach(() => { rt.slots = []; rt.cursor = 0; rt.effects = []; rt.effect = 0; });

describe('usePagedList：纯本地列表', () => {
  it('首屏 20 条，滚到底部每次多显示 20 条，不发请求、没有加载态', () => {
    const local = range(0, 45, 'l');
    const options: Options = { remote: null, local, key: 'all' };
    let list = render(options);
    expect(list.loading).toBe(false);
    expect(list.list).toEqual(local.slice(0, 20));
    expect(list.pagination).toEqual({ page: 1, pageSize: 20, total: 45 });
    expect(list.hasMore).toBe(true);
    list.loadMore(); list = render(options);
    expect(list.list).toHaveLength(40);
    list.loadMore(); list = render(options);
    expect(list.list).toHaveLength(45);
    expect(list.hasMore).toBe(false);
  });

  it('筛选变化立即回到第一页，并显示新的本地数据', () => {
    const all = range(0, 45, 'l'), few = range(0, 3, 'x');
    render({ remote: null, local: all, key: 'all' }).loadMore();
    expect(render({ remote: null, local: all, key: 'all' }).pagination.page).toBe(2);
    const next = render({ remote: null, local: few, key: 'few' });
    expect(next.pagination).toEqual({ page: 1, pageSize: 20, total: 3 });
    expect(next.list).toEqual(few);
    expect(next.loading).toBe(false);
  });

  it('本地数据变化（如刚新建了一条）不用刷新，下一次渲染就是最新的', () => {
    const options = (local: string[]): Options => ({ remote: null, local, key: 'all' });
    expect(render(options(['a'])).list).toEqual(['a']);
    expect(render(options(['b', 'a'])).list).toEqual(['b', 'a']);
  });
});

describe('usePagedList：接口数据在前，本地数据在后', () => {
  it('第一页回来之前是加载态；回来后显示接口数据，分类数量两侧相加', async () => {
    const remote = fakeRemote(25, { mine: 25 });
    const options: Options = { remote: remote.source, local: range(0, 30, 'l'), localCounts: { builtin: 30 }, key: 'all' };
    let list = render(options);
    expect(list.loading).toBe(true);
    expect(list.list).toEqual([]);
    expect(remote.calls).toEqual([{ page: 1, pageSize: 20 }]);
    await settle(); list = render(options);
    expect(list.loading).toBe(false);
    // 接口还有 5 条没取：先不露出本地数据
    expect(list.list).toEqual(range(0, 20));
    expect(list.pagination).toEqual({ page: 1, pageSize: 20, total: 55 });
    expect(list.counts).toEqual({ mine: 25, builtin: 30 });
    expect(list.hasMore).toBe(true);
  });

  it('接口取完之后的翻页只多显示本地数据，不再发请求', async () => {
    const remote = fakeRemote(25);
    const local = range(0, 30, 'l');
    const options: Options = { remote: remote.source, local, key: 'all' };
    render(options); await settle();
    render(options).loadMore();
    expect(render(options).loadingMore).toBe(true);
    await settle();
    let list = render(options);
    expect(remote.calls).toEqual([{ page: 1, pageSize: 20 }, { page: 2, pageSize: 20 }]);
    expect(list.loadingMore).toBe(false);
    expect(list.list).toEqual([...range(0, 25), ...local.slice(0, 15)]);
    list.loadMore(); list = render(options);
    expect(list.list).toHaveLength(55);
    expect(list.hasMore).toBe(false);
    expect(remote.calls).toHaveLength(2);
  });

  it('读取中重复触发翻页只请求一次', async () => {
    const remote = fakeRemote(60);
    const options: Options = { remote: remote.source, key: 'all' };
    render(options); await settle();
    const list = render(options);
    list.loadMore(); list.loadMore(); list.loadMore();
    await settle();
    expect(remote.calls.map((call) => call.page)).toEqual([1, 2]);
    expect(render(options).list).toHaveLength(40);
  });

  it('切换筛选：新数据回来之前继续显示上一份内容，过期的响应被丢弃', async () => {
    const first = fakeRemote(3, {}, 'a'), second = fakeRemote(2, {}, 'b');
    render({ remote: first.source, key: 'a' }); await settle();
    expect(render({ remote: first.source, key: 'a' }).list).toEqual(['a0', 'a1', 'a2']);
    // 换筛选：第二个接口先压住不返回
    second.state.hold = true;
    let list = render({ remote: second.source, key: 'b' });
    expect(list.loading).toBe(true);
    expect(list.list).toEqual(['a0', 'a1', 'a2']);
    // 再换回去又换过来之前，旧筛选的请求即使返回也不能覆盖
    second.state.held.splice(0).forEach((release) => release());
    await settle(); list = render({ remote: second.source, key: 'b' });
    expect(list.loading).toBe(false);
    expect(list.list).toEqual(['b0', 'b1']);
  });

  it('筛选连续变化：只有最后一次的结果生效', async () => {
    const slow = fakeRemote(3, {}, 'slow'), fast = fakeRemote(1, {}, 'fast');
    slow.state.hold = true;
    render({ remote: slow.source, key: 'slow' });
    render({ remote: fast.source, key: 'fast' });
    await settle();
    slow.state.held.splice(0).forEach((release) => release());
    await settle();
    expect(render({ remote: fast.source, key: 'fast' }).list).toEqual(['fast0']);
  });

  it('第一页读取失败：照常显示本地数据并给出原因，本地翻页不受影响；reload 重试', async () => {
    const remote = fakeRemote(5);
    remote.state.fail = true;
    const local = range(0, 30, 'l');
    const options: Options = { remote: remote.source, local, key: 'all' };
    render(options); await settle();
    let list = render(options);
    expect(list.loading).toBe(false);
    expect(list.error).toBe('网络异常');
    expect(list.list).toEqual(local.slice(0, 20));
    list.loadMore(); list = render(options);
    expect(list.list).toHaveLength(30);
    remote.state.fail = false;
    list.reload(); list = render(options);
    expect(list.loading).toBe(true);
    expect(list.list).toEqual([]);
    await settle(); list = render(options);
    expect(list.error).toBe('');
    expect(list.list).toEqual([...range(0, 5), ...local.slice(0, 15)]);
  });

  it('翻页失败：保留已显示的内容并给出原因，之后不再自动向接口翻页', async () => {
    const remote = fakeRemote(60);
    const options: Options = { remote: remote.source, key: 'all' };
    render(options); await settle();
    remote.state.fail = true;
    render(options).loadMore(); await settle();
    let list = render(options);
    expect(list.error).toBe('网络异常');
    expect(list.list).toHaveLength(20);
    expect(list.loadingMore).toBe(false);
    list.loadMore(); await settle(); list = render(options);
    expect(remote.calls).toHaveLength(2);
  });

  it('refresh 保持已加载的页数重读，内容不清空', async () => {
    const remote = fakeRemote(45);
    const options: Options = { remote: remote.source, key: 'all' };
    render(options); await settle();
    render(options).loadMore(); await settle();
    expect(render(options).list).toHaveLength(40);
    // 别处删掉了 10 条
    remote.state.total = 35;
    const pending = render(options).refresh();
    const during = render(options);
    expect(during.loading).toBe(false);
    expect(during.loadingMore).toBe(true);
    expect(during.list).toHaveLength(40);
    await pending;
    const list = render(options);
    expect(remote.calls.slice(2).map((call) => call.page)).toEqual([1, 2]);
    expect(list.list).toEqual(range(0, 35));
    expect(list.pagination).toEqual({ page: 2, pageSize: 20, total: 35 });
    expect(list.loadingMore).toBe(false);
  });

  it('卸载之后再调用 refresh / loadMore 不会发请求', async () => {
    const remote = fakeRemote(45);
    const options: Options = { remote: remote.source, key: 'all' };
    const list = render(options); await settle();
    // 卸载：执行所有 effect 的清理函数
    rt.effects.forEach((effect) => { if (effect.cleanup) effect.cleanup(); });
    await list.refresh(); list.loadMore(); list.reload(); await settle();
    expect(remote.calls).toHaveLength(1);
  });

  it('卸载后又重新挂载（StrictMode 二次挂载）照常翻页', async () => {
    const remote = fakeRemote(45);
    const options: Options = { remote: remote.source, key: 'all' };
    render(options); await settle();
    rt.effects.forEach((effect) => { if (effect.cleanup) effect.cleanup(); });
    rt.effects = [];
    render(options); await settle();
    render(options).loadMore(); await settle();
    expect(render(options).list).toHaveLength(40);
    expect(remote.calls.map((call) => call.page)).toEqual([1, 1, 2]);
  });

  it('某一页因为丢弃了不完整的行而不满 20 条时，照常继续翻页', async () => {
    // 共 45 行，第 1 页有一行读不懂被丢弃：第 1 页只有 19 条
    const calls: number[] = [];
    const source = async ({ page, pageSize }: PageRequest) => {
      calls.push(page);
      const rows = range((page - 1) * pageSize, Math.min(page * pageSize, 45)).filter(row => row !== 'r7');
      return { list: rows, pagination: { page, pageSize, total: 45 }, counts: {} };
    };
    const options: Options = { remote: source, key: 'all' };
    render(options); await settle();
    expect(render(options).list).toHaveLength(19);
    for (let i = 0; i < 3; i++) { render(options).loadMore(); await settle(); }
    const list = render(options);
    expect(list.list).toHaveLength(44);
    expect(list.hasMore).toBe(false);
    expect(calls).toEqual([1, 2, 3, 4]);
  });
  it('接口返回的总数与实际条数对不上时不会卡在「还有更多」', async () => {
    // 声称 25 条，第 2 页却是空的（期间被删除）
    const calls: number[] = [];
    const source = async ({ page, pageSize }: PageRequest) => {
      calls.push(page);
      return { list: page === 1 ? range(0, 20) : [], pagination: { page, pageSize, total: 25 }, counts: {} };
    };
    const options: Options = { remote: source, local: ['l0'], key: 'all' };
    render(options); await settle();
    render(options).loadMore(); await settle();
    const list = render(options);
    expect(list.list).toEqual([...range(0, 20), 'l0']);
    expect(list.hasMore).toBe(false);
    expect(calls).toEqual([1, 2]);
  });
});
