import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createProject } from '../data/templates';
vi.mock('@/lib/notify', () => ({ notify: { error: vi.fn(), fail: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
import { GUEST_KEY, purgeRecoveryCopies, readGuests, writeGuests, systemProject, readGuestDefault, writeGuestDefault } from './guestStore';

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

  it('首次运行内置模板不占用我的项目列表', () => {
    use(fakeStorage());
    expect(readGuests()).toHaveLength(0);
  });

  it('播种的默认方案带系统标记，用户新建的本机项目不带', () => {
    use(fakeStorage());
    const seeded = systemProject();
    expect(seeded.system).toBe(true);
    const mine = createProject('blank');
    writeGuests([mine, seeded]);
    const list = readGuests();
    expect(list.find(p => p.id === mine.id)!.system).toBeUndefined();
    expect(list.filter(p => p.system === true)).toHaveLength(1);
  });

  it('旧数据没有系统标记时，把更新时间最早的一条认作系统默认方案', () => {
    use(fakeStorage());
    const seeded = { ...createProject('reference'), updatedAt: '2026-01-01T00:00:00.000Z' };
    const newer = { ...createProject('blank'), updatedAt: '2026-02-01T00:00:00.000Z' };
    writeGuests([newer, seeded]);
    const list = readGuests();
    expect(list.find(p => p.id === seeded.id)!.system).toBe(true);
    expect(list.find(p => p.id === newer.id)!.system).toBeUndefined();
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
    expect(readGuests()).toHaveLength(0);
  });

  it('存储不可读时不凭空造项目', () => {
    use(fakeStorage({ throwOnRead: true }));
    expect(readGuests()).toEqual([]);
  });

  it('不同模板各自保留改动，刷新默认选中原木之家', () => {
    use(fakeStorage());
    const a=createProject('studio'), b=createProject('two-bed');
    a.state.furniture[0].cx+=100;b.state.furniture[0].cy+=200;
    expect(writeGuestDefault(a).ok).toBe(true);expect(writeGuestDefault(b).ok).toBe(true);
    expect(readGuestDefault('studio').state.furniture[0].cx).toBe(a.state.furniture[0].cx);
    expect(readGuestDefault('two-bed').state.furniture[0].cy).toBe(b.state.furniture[0].cy);
    expect(readGuestDefault().state.templateId).toBe('reference');
  });

  it('清理历史恢复副本与废弃键，保留其它键', () => {
    const storage = use(fakeStorage());
    storage.setItem('interior-recovery-u1-p1', '{}');
    storage.setItem('interior-recovery-u1-p2', '{}');
    storage.setItem('interior-guest-default-v1', '{}');
    storage.setItem('interior-guest-template-v1', 'two-bed');
    storage.setItem('unrelated', 'keep');
    purgeRecoveryCopies();
    expect(Array.from(storage.map.keys())).toEqual(['unrelated']);
  });
});
