import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hook 状态替身：不带 DOM、不连后端，用来验证「改过模版」计数的更新链路。
const harness = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0, mounted: false, cleanups: [] as (() => void)[] }));
const db = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState(initial: unknown) {
    const index = harness.cursor++;
    if (!(index in harness.slots)) harness.slots[index] = typeof initial === 'function' ? initial() : initial;
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
  // 首次渲染时执行全部 effect（模拟挂载），之后的渲染不再执行；清理函数留给 beforeEach 统一调用。
  useEffect(effect: () => void | (() => void)) {
    if (harness.mounted) return;
    const cleanup = effect();
    if (cleanup) harness.cleanups.push(cleanup);
  },
  useCallback(callback: unknown) {
    return callback;
  },
}));
vi.mock('@/lib/notify', () => ({ notify: { error: vi.fn(), fail: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() }, errorMessage: (cause: unknown) => String(cause) }));
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => vi.fn(async () => true) }));
vi.mock('@/lib/backend/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      getSession: async () => ({ data: { session: null }, error: null }),
      signOut: async () => ({ error: null }),
    },
    from: () => ({
      select: () => ({ order: () => ({ range: async () => ({ data: [], error: null }) }) }),
      update: (row: unknown) => {
        db.update(row);
        const chain = { eq: () => chain, select: () => chain, maybeSingle: async () => ({ data: { id: 'cloud-1', revision: 1, updated_at: 'now' }, error: null }) };
        return chain;
      },
    }),
  },
}));
import { useProjects } from '../hooks/use-projects';
import { designForTemplate } from '@/lib/floor-plan/templates';
const referenceDesign = () => designForTemplate('reference');

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
    const result = useProjects();
    harness.mounted = true;
    return result;
  };
  return { render: useHarness };
}
const { render } = setup();
const edited = () => {
  const design = referenceDesign();
  design.furniture[0] = { ...design.furniture[0], rot: (design.furniture[0].rot + 90) % 360 };
  return design;
};
beforeEach(() => {
  harness.cleanups.splice(0).forEach((cleanup) => cleanup());
  harness.slots = []; harness.cursor = 0; harness.mounted = false; db.update.mockReset();
  vi.unstubAllGlobals(); vi.useRealTimers();
  vi.stubGlobal('localStorage', fakeStorage());
});

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

describe('页面隐藏时立即保存', () => {
  /** 登录状态 + 当前是云端项目：直接写入 hook 的状态槽（第 2 个 useState 是 session）。 */
  function cloudProject() {
    const page = { win: new EventTarget(), doc: Object.assign(new EventTarget(), { visibilityState: 'visible' }) };
    vi.stubGlobal('window', page.win);
    vi.stubGlobal('document', page.doc);
    const first = render();
    harness.slots[harness.slots.indexOf(first.active)] = { ...first.active!, id: 'cloud-1', cloud: true, revision: 0, builtin: false };
    harness.slots[1] = { user: { id: 'u1' } };
    expect(render().session).toEqual({ user: { id: 'u1' } });
    return page;
  }

  it('保存在等待中时派发 pagehide，会立即保存一次，不再等防抖', async () => {
    vi.useFakeTimers();
    const { win } = cloudProject();
    render().update(edited());
    expect(db.update).not.toHaveBeenCalled();
    win.dispatchEvent(new Event('pagehide'));
    expect(db.update).toHaveBeenCalledTimes(1);
    await vi.runAllTimersAsync();
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it('页面变为 hidden 时同样立即保存', () => {
    vi.useFakeTimers();
    const { doc } = cloudProject();
    render().update(edited());
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it('没有待保存内容时不保存', () => {
    const { win } = cloudProject();
    win.dispatchEvent(new Event('pagehide'));
    expect(db.update).not.toHaveBeenCalled();
  });
});
