import { describe, expect, it } from 'vitest';
import { EMPTY_PAGES, PAGE_SIZE, addCounts, countBy, pagedView, readAll, type PageRequest } from '..';

const range = (n: number, prefix = 'r') => Array.from({ length: n }, (_, i) => prefix + i);

describe('统一分页格式', () => {
  it('一页 20 条', () => {
    expect(PAGE_SIZE).toBe(20);
  });

  it('本地数据按分类计数', () => {
    expect(countBy(['床', '沙发', '床'], item => item)).toEqual({ 床: 2, 沙发: 1 });
    expect(countBy([], () => 'x')).toEqual({});
  });

  it('readAll 按页读到取完为止；接口总数偏大时遇到空页即停', async () => {
    const calls: PageRequest[] = [];
    const items = await readAll(async request => {
      calls.push(request);
      const list = range(250).slice((request.page - 1) * request.pageSize, request.page * request.pageSize);
      return { list, pagination: { ...request, total: 260 }, counts: {} };
    });
    expect(items).toHaveLength(250);
    expect(calls.map(call => call.page)).toEqual([1, 2, 3, 4]);
    expect(calls.every(call => call.pageSize === 100)).toBe(true);
  });

  it('分类数量按分类相加，只在一侧出现的分类原样保留', () => {
    expect(addCounts({ a: 1, b: 2 }, { b: 3, c: 4 })).toEqual({ a: 1, b: 5, c: 4 });
    expect(addCounts({}, {})).toEqual({});
  });

  it('只有本地数据：按页切片，总数是本地条数', () => {
    const local = range(45, 'l');
    const first = pagedView(EMPTY_PAGES, local, { all: 45 }, 1);
    expect(first.list).toEqual(local.slice(0, 20));
    expect(first.pagination).toEqual({ page: 1, pageSize: 20, total: 45 });
    expect(first.counts).toEqual({ all: 45 });
    expect(pagedView(EMPTY_PAGES, local, {}, 2).list).toHaveLength(40);
    expect(pagedView(EMPTY_PAGES, local, {}, 3).list).toHaveLength(45);
  });

  it('接口数据在前、本地数据在后；接口没取完时不露出本地数据', () => {
    const local = range(30, 'l');
    // 接口共 25 条，只取回第一页
    const partial = pagedView({ items: range(20), total: 25, counts: { mine: 25 } }, local, { builtin: 30 }, 1);
    expect(partial.list).toEqual(range(20));
    expect(partial.pagination.total).toBe(55);
    expect(partial.counts).toEqual({ mine: 25, builtin: 30 });
    // 取完之后：第 2 页 = 接口剩下的 5 条 + 本地前 15 条
    const done = pagedView({ items: range(25), total: 25, counts: {} }, local, {}, 2);
    expect(done.list).toEqual([...range(25), ...local.slice(0, 15)]);
    // 第 3 页把本地剩下的全部显示出来
    expect(pagedView({ items: range(25), total: 25, counts: {} }, local, {}, 3).list).toHaveLength(55);
  });

  it('接口这一侧一条都没有时，第一页直接是本地数据', () => {
    expect(pagedView({ items: [], total: 0, counts: {} }, range(5, 'l'), {}, 1).list).toEqual(range(5, 'l'));
  });
});
