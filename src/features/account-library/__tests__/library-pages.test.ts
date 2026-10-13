import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/backend/connection', () => import('@/lib/backend/connection.testing'));
import { pageOf, rpcFake } from '@/lib/backend/connection.testing';
import { BUILTIN_IDS } from '@/lib/floor-plan/builtin-assets';
import { accountItemPage } from '../api/library-pages';

beforeEach(() => rpcFake.reset());

describe('账号库列表接口', () => {
  it('只取自建条目（排除内置家具的覆盖行），筛选交给数据库，读不懂的行丢弃', async () => {
    const wall = { wall_key: 'custom-22222222-2222-4222-8222-222222222222', name: '艺术涂料', color: '#d9cbb6', price: 120 };
    rpcFake.result = pageOf([
      { kind: 'wall', item_key: wall.wall_key, name: wall.name, category: '墙面', data: wall },
      { kind: 'floor', item_key: 'x', name: '坏数据', category: '地面', data: { floor_key: 'x', pattern: 'nope' } },
    ], 2, { 墙面: 1, 地面: 1 });
    const result = await accountItemPage({ page: 1, pageSize: 20 }, { major: '硬装', category: '墙面', query: ' 涂料 ' });
    expect(rpcFake.calls[0]).toEqual({ fn: 'interior_library_page', args: {
      p_kinds: ['furniture', 'floor', 'wall', 'opening', 'roof', 'ceiling'], p_exclude_keys: BUILTIN_IDS,
      p_major: '硬装', p_category: '墙面', p_query: '涂料', p_page: 1, p_page_size: 20,
    } });
    expect(result.list).toEqual([{ kind: 'wall', item: { key: wall.wall_key, name: '艺术涂料', color: '#d9cbb6', price: 120 } }]);
    expect(result.pagination.total).toBe(2);
    expect(result.counts).toEqual({ 墙面: 1, 地面: 1 });
  });
});
