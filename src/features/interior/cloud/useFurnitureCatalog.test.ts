import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hook 状态替身：不带 DOM、不连后端，验证「每页 12 条」与「分类计数不挡列表」的读取链路。
const harness = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0, mounted: false }));
const db = vi.hoisted(() => ({ calls: [] as { kind: string; from: number; to: number }[], stats: [] as string[] }));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState(initial: unknown) {
    const index = harness.cursor++;
    if (!(index in harness.slots)) harness.slots[index] = typeof initial === 'function' ? initial() : initial;
    return [
      harness.slots[index],
      (next: unknown) => { harness.slots[index] = typeof next === 'function' ? (next as (value: unknown) => unknown)(harness.slots[index]) : next; },
    ];
  },
  useRef(initial: unknown) {
    const index = harness.cursor++;
    if (!(index in harness.slots)) harness.slots[index] = { current: initial };
    return harness.slots[index] as { current: unknown };
  },
  useEffect(effect: () => void | (() => void)) { if (!harness.mounted) effect(); },
  useCallback(callback: unknown) { return callback; },
}));

const row = (i: number) => ({ catalog_id: `c${i}`, name: `家具${i}`, category: '卧室', type: 'chair', width: 400, depth: 400, color: '#ccc' });
const chain = (kind: string) => {
  const result: Record<string, unknown> = {};
  const self = () => result;
  Object.assign(result, {
    select: self, not: self, order: self, eq: self, in: self,
    // 计数查询只有 head:true（拿 count），列表查询才有 range。
    then: undefined as unknown,
    range: (from: number, to: number) => { db.calls.push({ kind, from, to }); return Promise.resolve({ data: Array.from({ length: to - from + 1 }, (_, i) => row(from + i)), count: 40, error: null }); },
    head: true as unknown,
  });
  return new Proxy(result, {
    get(target, prop: string) {
      if (prop === 'then') {
        if (kind === 'stats') { db.stats.push(kind); return (resolve: (v: unknown) => void) => resolve({ count: 7, error: null }); }
        return undefined;
      }
      return target[prop];
    },
  });
};
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) },
    from: () => chain('page'),
  },
}));
vi.mock('../ai/furnitureRow', () => ({ furnitureFromRow: (r: { catalog_id: string; name: string }) => ({ catalogId: r.catalog_id, name: r.name }) }));

import { CATALOG_PAGE_SIZE, useFurnitureCatalog } from './useFurnitureCatalog';

beforeEach(() => { harness.slots = []; harness.cursor = 0; harness.mounted = false; db.calls = []; });
/** 重新渲染：读最新的状态快照。 */
const useRendered = () => { harness.cursor = 0; const value = useFurnitureCatalog(); harness.mounted = true; return value; };

describe('useFurnitureCatalog 分页', () => {
  it('首屏只取一页 12 条，后续页码按 12 递增', async () => {
    await useRendered().load();
    expect(CATALOG_PAGE_SIZE).toBe(12);
    expect(db.calls).toEqual([{ kind: 'page', from: 0, to: 11 }]);
    const first = useRendered();
    expect(first.items).toHaveLength(12);
    expect(first.count).toBe(40);
    expect(first.hasMore).toBe(true);
    await first.load(true);
    expect(db.calls[1]).toEqual({ kind: 'page', from: 12, to: 23 });
    expect(useRendered().items).toHaveLength(24);
  });
});
