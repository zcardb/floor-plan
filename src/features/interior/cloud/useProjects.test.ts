import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hook 状态替身：不带 DOM、不连后端，用来验证「改过模版」计数的更新链路。
const harness = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0, mounted: false }));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState(initial: unknown) {
    const index = harness.cursor++;
    if (!(index in harness.slots)) harness.slots[index] = initial;
    return [
      harness.slots[index],
      (next: unknown) => {
        harness.slots[index] = typeof next === 'function'
          ? (next as (value: unknown) => unknown)(harness.slots[index])
          : next;
      },
    ];
  },
  useRef(initial: unknown) {
    const index = harness.cursor++;
    if (!(index in harness.slots)) harness.slots[index] = { current: initial };
    return harness.slots[index] as { current: unknown };
  },
  useEffect(effect: () => void) {
    if (!harness.mounted) { harness.mounted = true; effect(); }
  },
  useCallback(callback: unknown) {
    return callback;
  },
}));
vi.mock('@/lib/notify', () => ({ notify: { error: vi.fn(), fail: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() }, errorMessage: (cause: unknown) => String(cause) }));
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => vi.fn(async () => true) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      getSession: async () => ({ data: { session: null }, error: null }),
      signOut: async () => ({ error: null }),
    },
    from: () => ({ select: () => ({ order: () => ({ range: async () => ({ data: [], error: null }) }) }) }),
  },
}));
import { useProjects } from './useProjects';
import { referenceDesign } from '../data/templates';

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string) => { map.set(key, value); },
    removeItem: (key: string) => { map.delete(key); },
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    get length() { return map.size; },
  };
}
/** 与 useAccountCostCommit.test.ts 同样的写法：把 hook 包进 setup，调用点别名不带 use 前缀。 */
function setup() {
  const useHarness = () => {
    harness.cursor = 0;
    return useProjects();
  };
  return { render: useHarness };
}
const { render } = setup();
const edited = () => {
  const design = referenceDesign();
  design.furniture[0] = { ...design.furniture[0], rot: (design.furniture[0].rot + 90) % 360 };
  return design;
};
beforeEach(() => { harness.slots = []; harness.cursor = 0; harness.mounted = false; vi.stubGlobal('localStorage', fakeStorage()); });

describe('游客「模版已更改」计数', () => {
  it('未改动时为 0，改过方案后 +1', () => {
    expect(render().guestEdits).toBe(0);
    render().update(edited());
    expect(render().guestEdits).toBe(1);
    render().update(edited());
    expect(render().guestEdits).toBe(2);
  });

  it('重置方案、或撤销回到初始模版后归零（顶部提示条随之消失）', () => {
    render().update(edited());
    expect(render().guestEdits).toBe(1);
    // 重置方案产出的状态：初始模版 + 保留结构解锁标记。
    render().update({ ...referenceDesign(), structureUnlocked: true });
    expect(render().guestEdits).toBe(0);
  });

  it('只是切换尺寸标注显示不算改过模版', () => {
    render().update({ ...referenceDesign(), dimensionSettings: { visible: false } });
    expect(render().guestEdits).toBe(0);
  });
});
