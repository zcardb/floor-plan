import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/backend/connection', () => import('@/lib/backend/connection.testing'));
import { pageOf, rpcFake } from '@/lib/backend/connection.testing';
import { decorStyleById } from '@/lib/floor-plan/decor-styles';
import { accountStylePage } from '../api/account-styles';

beforeEach(() => rpcFake.reset());

describe('我的风格列表接口', () => {
  it('只取风格行，转换成风格定义', async () => {
    const { id: _id, name: _name, ...spec } = decorStyleById('cream');
    rpcFake.result = pageOf([{ kind: 'style', item_key: 'my-abc123def456', name: '我家的奶油', category: '奶油', data: { style_key: 'my-abc123def456', name: '我家的奶油', spec } }]);
    const result = await accountStylePage({ page: 1, pageSize: 20 }, { category: '奶油' });
    expect(rpcFake.calls[0].args).toMatchObject({ p_kinds: ['style'], p_category: '奶油', p_query: null });
    expect(rpcFake.calls[0].args).not.toHaveProperty('p_exclude_keys');
    expect(result.list.map(style => [style.id, style.name])).toEqual([['my-abc123def456', '我家的奶油']]);
  });
});
