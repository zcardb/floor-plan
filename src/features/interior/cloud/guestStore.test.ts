import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createProject } from '../data/templates';
vi.mock('@/lib/notify', () => ({ notify: { error: vi.fn(), fail: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
import { GUEST_KEY, purgeRecoveryCopies, readGuests, writeGuests } from './guestStore';

/** 最小 Storage 替身：可注入读/写抛错，用来模拟无权限与配额不足。 */
function fakeStorage(options: { throwOnRead?: boolean; throwOnWrite?: boolean } = {}) {
  const map = new Map<string, string>();
  return {
    map,
    getItem(key: string) {
      if (options.throwOnRead) throw new Error('storage blocked');
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      if (options.throwOnWrite) throw new Error('QuotaExceededError');
      map.set(key, value);
    },
    removeItem(key: string) { map.delete(key); },
    key(index: number) { return Array.from(map.keys())[index] ?? null; },
    get length() { return map.size; },
  };
}

const use = (storage: ReturnType<typeof fakeStorage>) => {
  vi.stubGlobal('localStorage', storage);
  return storage;
};

describe('本机方案存储', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('首次运行播种一份参考户型方案', () => {
    use(fakeStorage());
    expect(readGuests()).toHaveLength(1);
  });

  it('写进去的列表读得回来', () => {
    use(fakeStorage());
    const p = createProject('blank');
    expect(writeGuests([p])).toEqual({ ok: true });
    expect(readGuests().map(x => x.id)).toEqual([p.id]);
    expect(readGuests()[0].cloud).toBe(false);
  });

  it('删空之后仍然读到空列表，默认方案不会被重新播种', () => {
    use(fakeStorage());
    writeGuests([createProject('blank')]);
    expect(writeGuests([])).toEqual({ ok: true });
    expect(readGuests()).toEqual([]);
  });

  it('写入失败时返回失败且存储内容不变', () => {
    const storage = use(fakeStorage());
    writeGuests([createProject('blank')]);
    const before = storage.map.get(GUEST_KEY);
    use(fakeStorage({ throwOnWrite: true }));
    expect(writeGuests([]).ok).toBe(false);
    expect(storage.map.get(GUEST_KEY)).toBe(before);
    expect(readGuests()).toHaveLength(1);
  });

  it('存储不可读时不凭空造项目', () => {
    use(fakeStorage({ throwOnRead: true }));
    expect(readGuests()).toEqual([]);
  });

  it('清理历史恢复副本，保留其它键', () => {
    const storage = use(fakeStorage());
    storage.setItem('interior-recovery-u1-p1', '{}');
    storage.setItem('interior-recovery-u1-p2', '{}');
    storage.setItem('unrelated', 'keep');
    purgeRecoveryCopies();
    expect(Array.from(storage.map.keys())).toEqual(['unrelated']);
  });
});
