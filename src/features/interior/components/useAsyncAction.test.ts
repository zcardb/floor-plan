import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAsyncAction } from '@/hooks/useAsyncAction';

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (cause: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('useAsyncAction', () => {
  it('ignores a second call while the first is pending', async () => {
    const gate = deferred<string>();
    const action = vi.fn(() => gate.promise);
    const { result } = renderHook(() => useAsyncAction(action));
    let first!: Promise<string | undefined>, second!: Promise<string | undefined>;
    act(() => { first = result.current.run(); second = result.current.run(); });
    expect(action).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBe(true);
    await act(async () => { gate.resolve('done'); await first; });
    expect(await second).toBeUndefined();
    expect(result.current.pending).toBe(false);
  });

  it('resets pending after the action throws and allows a retry', async () => {
    const action = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce('ok');
    const { result } = renderHook(() => useAsyncAction(action));
    await act(async () => { await expect(result.current.run()).rejects.toThrow('offline'); });
    expect(result.current.pending).toBe(false);
    let value: unknown;
    await act(async () => { value = await result.current.run(); });
    expect(value).toBe('ok');
  });

  it('exposes the key of the pending call', async () => {
    const gate = deferred<void>();
    const { result } = renderHook(() => useAsyncAction((_id: string) => gate.promise, id => id));
    let run!: Promise<void | undefined>;
    act(() => { run = result.current.run('row-2'); });
    expect(result.current.pendingKey).toBe('row-2');
    await act(async () => { gate.resolve(); await run; });
    expect(result.current.pendingKey).toBeNull();
  });

  it('does not update state after unmount', async () => {
    const gate = deferred<void>();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result, unmount } = renderHook(() => useAsyncAction(() => gate.promise));
    let run!: Promise<void | undefined>;
    act(() => { run = result.current.run(); });
    unmount();
    gate.resolve();
    await run;
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});
