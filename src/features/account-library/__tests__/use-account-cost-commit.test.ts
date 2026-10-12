import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountCostSettings } from '@/lib/floor-plan/cost-defaults';

// Hook state harness: exercise async write ordering without a DOM or a backend.
const harness = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0, cleanup: undefined as undefined | (() => void), mounted: false }));
vi.mock('react', () => ({
  useState(initial: unknown) {
    const index = harness.cursor++;
    if (!(index in harness.slots)) harness.slots[index] = initial;
    return [harness.slots[index], (next: unknown) => { harness.slots[index] = next; }];
  },
  useRef(initial: unknown) {
    const index = harness.cursor++;
    if (!(index in harness.slots)) harness.slots[index] = { current: initial };
    return harness.slots[index];
  },
  useEffect(effect: () => (() => void)) {
    if (!harness.mounted) { harness.cleanup = effect(); harness.mounted = true; }
  },
}));
import { useAccountCostCommit } from '../hooks/use-account-cost-commit';

function setup(save: (settings: AccountCostSettings) => Promise<boolean>, settings: AccountCostSettings = {}) {
  const onDirty = vi.fn();
  const useHarness = () => { harness.cursor = 0; return useAccountCostCommit({ settings, save, onDirty }); };
  return { render: useHarness, onDirty, setSettings: (next: AccountCostSettings) => { settings = next; } };
}
beforeEach(() => { harness.slots = []; harness.cursor = 0; harness.cleanup = undefined; harness.mounted = false; });
describe('单项自动保存与重试', () => {
  it('保存成功前保持未保存，阻止重复提交', async () => {
    let resolve!: (value: boolean) => void;
    const save = vi.fn(() => new Promise<boolean>(done => { resolve = done; }));
    const { render, onDirty } = setup(save);
    const write = render().apply(() => ({ wallPrices: { paint: 0 } }));
    expect(render().busy).toBe(true);
    expect(render().saved).toBe(false);
    expect(await render().apply(() => ({ wallPrices: { wallpaper: 20 } }))).toBe(false);
    expect(save).toHaveBeenCalledTimes(1);
    resolve(true); expect(await write).toBe(true);
    expect(render().pending).toBeNull();
    expect(render().saved).toBe(true);
    expect(onDirty.mock.calls).toEqual([[true], [false]]);
  });
  it('失败保留完整修改，重试成功后清除错误与离开保护', async () => {
    const save = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const { render, onDirty } = setup(save, { constructionPrices: { build: 90 } });
    await render().apply(current => ({ ...current, furniturePrices: { bed: null } }));
    expect(render().error).not.toBe('');
    expect(render().settings).toEqual({ constructionPrices: { build: 90 }, furniturePrices: { bed: null } });
    expect(onDirty).not.toHaveBeenCalledWith(false);
    await render().retry();
    expect(save.mock.calls[1][0]).toEqual(save.mock.calls[0][0]);
    expect(render().error).toBe('');
    expect(render().pending).toBeNull();
    expect(onDirty).toHaveBeenLastCalledWith(false);
  });
  it('连续成功修改以最新已保存配置为基线，0与null均保留', async () => {
    const save = vi.fn().mockResolvedValue(true);
    const { render, setSettings } = setup(save);
    await render().apply(() => ({ wallPrices: { paint: 0 } }));
    setSettings(save.mock.calls[0][0]);
    await render().apply(current => ({ ...current, openingPrices: { door: null } }));
    expect(save.mock.calls[1][0]).toEqual({ wallPrices: { paint: 0 }, openingPrices: { door: null } });
  });
  it('异常后释放提交锁，允许重试', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('网络断开')).mockResolvedValueOnce(true);
    const { render } = setup(save);
    await render().apply(() => ({ floorPrices: { wood: 100 } }));
    expect(render().error).toBe('网络断开');
    expect(render().busy).toBe(false);
    expect(await render().retry()).toBe(true);
  });
  it('卸载后晚到成功不会修改新页面离开保护', async () => {
    let resolve!: (value: boolean) => void;
    const { render, onDirty } = setup(() => new Promise<boolean>(done => { resolve = done; }));
    const write = render().apply(() => ({ wallPrices: { paint: 20 } }));
    harness.cleanup?.(); resolve(true);
    expect(await write).toBe(false);
    expect(onDirty.mock.calls).toEqual([[true]]);
  });
});
