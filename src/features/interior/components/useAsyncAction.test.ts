import { beforeEach, describe, expect, it, vi } from 'vitest';

// 与 Workbench.test 一致：用最小 hooks 替身直接驱动 hook，无需 DOM 环境。
const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, cleanups: [] as (() => void)[] }));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = initial;
    return [hooks.values[index], (value: unknown) => { hooks.values[index] = value; }];
  },
  useRef: (() => { const refs: { current: unknown }[] = []; return (value: unknown) => { const index = hooks.cursor++; return refs[index] ??= { current: value }; }; })(),
  useEffect: (effect: () => (() => void) | void) => { const cleanup = effect(); if (cleanup) hooks.cleanups.push(cleanup); },
  useCallback: (callback: unknown) => callback,
}));
import { useAsyncAction } from '@/hooks/useAsyncAction';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => { resolve = res; });
  return { promise, resolve };
}
function render<A extends unknown[], R>(action: (...args: A) => Promise<R>, keyOf?: (...args: A) => string) {
  hooks.cursor = 0;
  return useAsyncAction(action, keyOf);
}

describe('useAsyncAction', () => {
  beforeEach(() => { hooks.values = []; hooks.cleanups = []; });

  it('进行中再次调用会被忽略，只执行一次', async () => {
    const gate = deferred<string>();
    const action = vi.fn(() => gate.promise);
    const first = render(action).run();
    const second = render(action).run();
    expect(action).toHaveBeenCalledTimes(1);
    expect(render(action).pending).toBe(true);
    gate.resolve('done');
    expect(await first).toBe('done');
    expect(await second).toBeUndefined();
    expect(render(action).pending).toBe(false);
  });

  it('操作抛错后 pending 复位，并且可以重试', async () => {
    const action = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce('ok');
    await expect(render(action).run()).rejects.toThrow('offline');
    expect(render(action).pending).toBe(false);
    expect(await render(action).run()).toBe('ok');
  });

  it('pendingKey 标识正在处理的那一行', async () => {
    const gate = deferred<void>();
    const keyOf = (id: string) => id;
    const run = render((_id: string) => gate.promise, keyOf).run('row-2');
    expect(render((_id: string) => gate.promise, keyOf).pendingKey).toBe('row-2');
    gate.resolve();
    await run;
    expect(render((_id: string) => gate.promise, keyOf).pendingKey).toBeNull();
  });

  it('卸载后结束不再写入状态', async () => {
    const gate = deferred<void>();
    const run = render(() => gate.promise).run();
    const pendingBefore = hooks.values[0];
    hooks.cleanups.forEach(cleanup => cleanup());
    gate.resolve();
    await run;
    expect(hooks.values[0]).toBe(pendingBefore);
  });
});
