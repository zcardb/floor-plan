import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/backend/connection', () => import('@/lib/backend/connection.testing'));
import { pageOf, rpcFake } from '@/lib/backend/connection.testing';
import { readPage } from '../page-rpc';

beforeEach(() => rpcFake.reset());

describe('列表接口：统一分页格式 { list, pagination, counts }', () => {
  it('页码与每页条数作为 p_page / p_page_size 传给数据库函数，筛选条件原样带上', async () => {
    rpcFake.result = pageOf([{ id: 1 }], 41, { a: 3 });
    const result = await readPage('interior_assistant_page', { p_query: '床' }, { page: 3, pageSize: 20 });
    expect(rpcFake.calls).toEqual([{ fn: 'interior_assistant_page', args: { p_query: '床', p_page: 3, p_page_size: 20 } }]);
    expect(result).toEqual({ list: [{ id: 1 }], pagination: { page: 3, pageSize: 20, total: 41 }, counts: { a: 3 } });
  });

  it('接口报错或返回的形状不对时按读取失败处理', async () => {
    rpcFake.error = { message: 'function interior_assistant_page does not exist' };
    await expect(readPage('interior_assistant_page', {}, { page: 1, pageSize: 20 })).rejects.toThrow('does not exist');
    rpcFake.error = null;
    rpcFake.result = { list: 'oops', pagination: {} };
    await expect(readPage('interior_assistant_page', {}, { page: 1, pageSize: 20 })).rejects.toThrow('格式不对');
  });
});
