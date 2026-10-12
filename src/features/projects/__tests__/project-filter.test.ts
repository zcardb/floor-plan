import { describe, expect, it } from 'vitest';
import { localProjectEntries, mineEntry, projectScopeCounts } from '../model/project-filter';
import type { TemplatePreset } from '@/lib/floor-plan/template-presets';
import type { ProjectSummary } from '../hooks/use-projects';

const preset = (id: string, name: string, description = '', layout = ''): TemplatePreset => ({ id, name, layout, description, area: 80, build: () => { throw new Error('unused'); } });
const row = (id: string, name: string, updatedAt: string): ProjectSummary => ({ id, name, updatedAt, revision: 0 });
const presets = [preset('a', '两室一厅', '南向采光', '2室1厅'), preset('b', 'Studio 公寓', '开放式厨房')];
const guests = [row('old', '老房翻新', '2026-01-01'), row('new', '新家 Studio', '2026-10-01'), row('mid', '书房改造', '2026-05-01')];
const keys = (list: ReturnType<typeof localProjectEntries>) => list.map(e => e.key);

describe('localProjectEntries：列表里不经接口的部分', () => {
  it('全部：本机方案按修改时间倒序在前，内置模板保持原顺序在后', () => {
    expect(keys(localProjectEntries(presets, guests, 'all', ''))).toEqual(['mine:new', 'mine:mid', 'mine:old', 'builtin:a', 'builtin:b']);
  });
  it('内置 / 我的 只返回对应来源', () => {
    expect(keys(localProjectEntries(presets, guests, 'builtin', ''))).toEqual(['builtin:a', 'builtin:b']);
    expect(keys(localProjectEntries(presets, guests, 'mine', ''))).toEqual(['mine:new', 'mine:mid', 'mine:old']);
  });
  it('搜索不区分大小写、忽略首尾空格，内置模板也匹配户型与描述', () => {
    expect(keys(localProjectEntries(presets, guests, 'all', '  studio '))).toEqual(['mine:new', 'builtin:b']);
    expect(keys(localProjectEntries(presets, guests, 'all', '南向'))).toEqual(['builtin:a']);
    expect(keys(localProjectEntries(presets, guests, 'all', '2室'))).toEqual(['builtin:a']);
    expect(localProjectEntries(presets, guests, 'mine', '南向')).toEqual([]);
  });
  it('不修改传入数组的顺序', () => {
    const input = [...guests];
    localProjectEntries(presets, input, 'all', '');
    expect(input.map(r => r.id)).toEqual(['old', 'new', 'mid']);
  });
  it('接口返回的云端项目用同一种行', () => {
    expect(mineEntry(row('c', '云端项目', '2026-10-02'))).toMatchObject({ kind: 'mine', key: 'mine:c' });
  });
});

describe('projectScopeCounts：分类胶囊上的数量', () => {
  it('全部 = 我的 + 内置；缺省按 0', () => {
    expect(projectScopeCounts({ mine: 47, builtin: 10 })).toEqual({ all: 57, builtin: 10, mine: 47 });
    expect(projectScopeCounts({})).toEqual({ all: 0, builtin: 0, mine: 0 });
  });
});
