import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hooks = vi.hoisted(() => ({ contexts: new Map<unknown, unknown>() }));
vi.mock('react', async original => {
  const actual = await original<typeof import('react')>();
  return {
    ...actual,
    useContext: (context: unknown) => hooks.contexts.get(context),
    useState: (initial: unknown) => [typeof initial === 'function' ? (initial as () => unknown)() : initial, () => {}],
  };
});
const notify = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn(), error: vi.fn(), fail: vi.fn(), info: vi.fn() }));
vi.mock('@/lib/notify', () => ({ notify }));

import { blankDesign } from '../data/templates';
import type { Design } from '../model/types';
import { AccountCostSaveContext, CostDefaultsContext } from './CostDefaultsContext';
import { PriceField } from './PriceField';
import { PriceInput } from './PriceInput';

type Node = ReactElement<Record<string, unknown>>;
function nodes(tree: ReactNode): Node[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!isValidElement<Record<string, unknown>>(tree)) return [];
  return [tree, ...nodes(tree.props.children as ReactNode)];
}

/** 一件项目覆盖价为 80 的软装，账号库还没定价（同步默认勾选）。 */
function setup(save: (next: unknown) => Promise<boolean>) {
  const design: Design = { ...blankDesign(), costSettings: { furniturePrices: { sofa: 80 } } };
  let current = design;
  const change = vi.fn((fn: (d: Design) => Design) => { current = fn(current); });
  hooks.contexts.set(CostDefaultsContext, {});
  hooks.contexts.set(AccountCostSaveContext, save);
  const field = nodes(PriceField({ design, group: 'furniturePrices', priceKey: 'sofa', name: '沙发', unit: '件', change }));
  const apply = field.find(n => n.type === PriceInput)!.props.onApply as (v: number | null) => Promise<void | boolean>;
  return { apply, change, design: () => current };
}

beforeEach(() => { hooks.contexts.clear(); Object.values(notify).forEach(fn => fn.mockClear()); });

describe('PriceField 同步到账号库', () => {
  it('回车即生效：先改为继承账号默认价，不等云端写完', async () => {
    let finish: (ok: boolean) => void = () => {};
    const save = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
    const { apply, change, design } = setup(save);
    const pending = apply(120);
    expect(save).toHaveBeenCalledWith({ furniturePrices: { sofa: 120 } });
    // 云端还没返回，项目已经去掉覆盖价、跟随（已乐观更新的）账号默认价
    expect(change).toHaveBeenCalledTimes(1);
    expect(design().costSettings?.furniturePrices?.sofa).toBeUndefined();
    finish(true);
    await expect(pending).resolves.toBeUndefined();
    expect(change).toHaveBeenCalledTimes(1);
    expect(notify.fail).not.toHaveBeenCalled();
  });

  it('云端写失败：这次输入留作本项目单价，并提示同步失败', async () => {
    const { apply, change, design } = setup(vi.fn(async () => false));
    await expect(apply(120)).resolves.toBe(false);
    expect(change).toHaveBeenCalledTimes(2);
    expect(design().costSettings?.furniturePrices?.sofa).toBe(120);
    expect(notify.fail).toHaveBeenCalledWith('「沙发」同步到账号库失败，已只在本项目生效');
  });
});
