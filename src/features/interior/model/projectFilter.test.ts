import { describe, expect, it } from 'vitest';
import { filterProjects, paginate } from './projectFilter';
import type { TemplatePreset } from '../data/templatePresets';
import type { ProjectSummary } from '../cloud/useProjects';

const preset = (id: string, name: string, description = '', layout = ''): TemplatePreset => ({ id, name, layout, description, area: 80, build: () => { throw new Error('unused'); } });
const row = (id: string, name: string, updatedAt: string): ProjectSummary => ({ id, name, updatedAt, revision: 0 });
const presets = [preset('a', '两室一厅', '南向采光', '2室1厅'), preset('b', 'Studio 公寓', '开放式厨房')];
const rows = [row('old', '老房翻新', '2026-01-01'), row('new', '新家 Studio', '2026-10-01'), row('mid', '书房改造', '2026-05-01')];
const keys = (list: ReturnType<typeof filterProjects>) => list.map(e => e.key);

describe('filterProjects', () => {
  it('全部：我的项目按修改时间倒序在前，内置模板保持原顺序在后', () => {
    expect(keys(filterProjects(presets, rows, 'all', ''))).toEqual(['mine:new', 'mine:mid', 'mine:old', 'builtin:a', 'builtin:b']);
  });
  it('内置 / 我的 只返回对应来源', () => {
    expect(keys(filterProjects(presets, rows, 'builtin', ''))).toEqual(['builtin:a', 'builtin:b']);
    expect(keys(filterProjects(presets, rows, 'mine', ''))).toEqual(['mine:new', 'mine:mid', 'mine:old']);
  });
  it('搜索不区分大小写、忽略首尾空格，内置模板也匹配户型与描述', () => {
    expect(keys(filterProjects(presets, rows, 'all', '  studio '))).toEqual(['mine:new', 'builtin:b']);
    expect(keys(filterProjects(presets, rows, 'all', '南向'))).toEqual(['builtin:a']);
    expect(keys(filterProjects(presets, rows, 'all', '2室'))).toEqual(['builtin:a']);
    expect(filterProjects(presets, rows, 'mine', '南向')).toEqual([]);
  });
  it('不修改传入数组的顺序', () => {
    const input = [...rows];
    filterProjects(presets, input, 'all', '');
    expect(input.map(r => r.id)).toEqual(['old', 'new', 'mid']);
  });
});

describe('paginate', () => {
  const list = Array.from({ length: 25 }, (_, i) => i);
  it('按页切片并返回总页数', () => {
    expect(paginate(list, 1, 12)).toEqual({ items: list.slice(0, 12), page: 1, pages: 3 });
    expect(paginate(list, 3, 12).items).toEqual([24]);
  });
  it('页码越界修正到有效范围，空列表视为 1 页', () => {
    expect(paginate(list, 9, 12).page).toBe(3);
    expect(paginate(list, 0, 12).page).toBe(1);
    expect(paginate([], 2, 12)).toEqual({ items: [], page: 1, pages: 1 });
  });
});
