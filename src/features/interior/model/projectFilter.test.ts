import { describe, expect, it } from 'vitest';
import { filterProjects, visibleEntries } from './projectFilter';
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

describe('visibleEntries', () => {
  const entries = filterProjects(presets, rows, 'all', '');
  it('取前 visible 条', () => {
    expect(keys(visibleEntries(entries, 2, false).items)).toEqual(['mine:new', 'mine:mid']);
    expect(visibleEntries(entries, 12, false)).toMatchObject({ available: 5 });
  });
  it('云端还有更多时内置模板暂不露出', () => {
    expect(keys(visibleEntries(entries, 12, true).items)).toEqual(['mine:new', 'mine:mid', 'mine:old']);
    expect(visibleEntries(entries, 12, true).available).toBe(3);
  });
});
