import { beforeEach, describe, expect, it, vi } from 'vitest';

// 假后端：记录列表函数的调用，返回用例指定的结果。
const db = vi.hoisted(() => ({ calls: [] as { fn: string; args: Record<string, unknown> }[], result: null as unknown, error: null as null | { message: string } }));
vi.mock('./backend', () => ({
  backend: async () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => { db.calls.push({ fn, args }); return { data: db.result, error: db.error }; },
  }),
}));
import { readPage } from './pageRpc';
import { accountItemPage } from './libraryPages';
import { accountStylePage } from './accountStyles';
import { assistantPage } from './assistants';
import { projectPage } from './projectPages';
import { BUILTIN_IDS } from '../model/builtinAssets';
import { decorStyleById } from '../model/decorStyles';

const page = (list: unknown[], total = list.length, counts: Record<string, number> = {}) => ({ list, pagination: { page: 1, pageSize: 20, total }, counts });
beforeEach(() => { db.calls = []; db.result = null; db.error = null; });

describe('列表接口：统一分页格式 { list, pagination, counts }', () => {
  it('页码与每页条数作为 p_page / p_page_size 传给数据库函数，筛选条件原样带上', async () => {
    db.result = page([{ id: 1 }], 41, { a: 3 });
    const result = await readPage('interior_assistant_page', { p_query: '床' }, { page: 3, pageSize: 20 });
    expect(db.calls).toEqual([{ fn: 'interior_assistant_page', args: { p_query: '床', p_page: 3, p_page_size: 20 } }]);
    expect(result).toEqual({ list: [{ id: 1 }], pagination: { page: 3, pageSize: 20, total: 41 }, counts: { a: 3 } });
  });

  it('接口报错或返回的形状不对时按读取失败处理', async () => {
    db.error = { message: 'function interior_assistant_page does not exist' };
    await expect(readPage('interior_assistant_page', {}, { page: 1, pageSize: 20 })).rejects.toThrow('does not exist');
    db.error = null;
    db.result = { list: 'oops', pagination: {} };
    await expect(readPage('interior_assistant_page', {}, { page: 1, pageSize: 20 })).rejects.toThrow('格式不对');
  });

  it('账号库：只取自建条目（排除内置家具的覆盖行），筛选交给数据库，读不懂的行丢弃', async () => {
    const wall = { wall_key: 'custom-22222222-2222-4222-8222-222222222222', name: '艺术涂料', color: '#d9cbb6', price: 120 };
    db.result = page([
      { kind: 'wall', item_key: wall.wall_key, name: wall.name, category: '墙面', data: wall },
      { kind: 'floor', item_key: 'x', name: '坏数据', category: '地面', data: { floor_key: 'x', pattern: 'nope' } },
    ], 2, { 墙面: 1, 地面: 1 });
    const result = await accountItemPage({ page: 1, pageSize: 20 }, { major: '硬装', category: '墙面', query: ' 涂料 ' });
    expect(db.calls[0]).toEqual({ fn: 'interior_library_page', args: {
      p_kinds: ['furniture', 'floor', 'wall', 'opening', 'roof', 'ceiling'], p_exclude_keys: BUILTIN_IDS,
      p_major: '硬装', p_category: '墙面', p_query: '涂料', p_page: 1, p_page_size: 20,
    } });
    expect(result.list).toEqual([{ kind: 'wall', item: { key: wall.wall_key, name: '艺术涂料', color: '#d9cbb6', price: 120 } }]);
    expect(result.pagination.total).toBe(2);
    expect(result.counts).toEqual({ 墙面: 1, 地面: 1 });
  });

  it('我的风格：只取风格行，转换成风格定义', async () => {
    const { id: _id, name: _name, ...spec } = decorStyleById('cream');
    db.result = page([{ kind: 'style', item_key: 'my-abc123def456', name: '我家的奶油', category: '奶油', data: { style_key: 'my-abc123def456', name: '我家的奶油', spec } }]);
    const result = await accountStylePage({ page: 1, pageSize: 20 }, { category: '奶油' });
    expect(db.calls[0].args).toMatchObject({ p_kinds: ['style'], p_category: '奶油', p_query: null });
    expect(db.calls[0].args).not.toHaveProperty('p_exclude_keys');
    expect(result.list.map(style => [style.id, style.name])).toEqual([['my-abc123def456', '我家的奶油']]);
  });

  it('小助手与项目：列表行换成页面用的对象', async () => {
    db.result = page([{ id: 'a1', name: '极简', avatar: 'bot', model: 'm', prompt: 'p', updated_at: '2026-10-12' }]);
    expect((await assistantPage({ page: 1, pageSize: 20 })).list).toEqual([{ id: 'a1', name: '极简', avatar: 'bot', model: 'm', prompt: 'p', updatedAt: '2026-10-12' }]);
    db.result = page([{ id: 'p1', name: '我的家', updated_at: null, revision: 3, thumbnail: null }], 1, { mine: 1 });
    const projects = await projectPage({ page: 1, pageSize: 20 }, { query: '家', thumbnails: false });
    expect(db.calls[db.calls.length - 1]).toEqual({ fn: 'interior_project_page', args: { p_query: '家', p_thumbnails: false, p_page: 1, p_page_size: 20 } });
    expect(projects.list).toEqual([{ id: 'p1', name: '我的家', updatedAt: '', revision: 3, thumbnail: null, cloud: true }]);
    expect(projects.counts).toEqual({ mine: 1 });
  });
});
