import type { PageCounts } from '@/lib/paging';
import type { TemplatePreset } from '../data/templatePresets';
import type { ProjectSummary } from '../cloud/useProjects';

export type ProjectScope = 'all' | 'builtin' | 'mine';
export type ProjectEntry =
  | { kind: 'builtin'; key: string; preset: TemplatePreset }
  | { kind: 'mine'; key: string; row: ProjectSummary };

export const PROJECT_SCOPES: { id: ProjectScope; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'builtin', label: '内置' },
  { id: 'mine', label: '我的' },
];

const includes = (text: string, q: string) => text.toLowerCase().includes(q);

/** 我的项目（云端或本机）在列表里的一行。 */
export const mineEntry = (row: ProjectSummary): ProjectEntry => ({ kind: 'mine', key: 'mine:' + row.id, row });

/**
 * 列表里不经接口的部分：本机方案（按修改时间倒序）在前，内置模板（保持原顺序）在后，按分类与搜索词过滤。
 * 云端项目由列表接口分页返回（按修改时间倒序），排在它们之前。
 */
export function localProjectEntries(presets: readonly TemplatePreset[], guests: readonly ProjectSummary[], scope: ProjectScope, query: string): ProjectEntry[] {
  const q = query.trim().toLowerCase();
  const mine = scope === 'builtin' ? [] : guests
    .filter(row => !q || includes(row.name, q))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(mineEntry);
  const builtin: ProjectEntry[] = scope === 'mine' ? [] : presets
    .filter(p => !q || [p.name, p.layout, p.description].some(text => includes(text, q)))
    .map(preset => ({ kind: 'builtin', key: 'builtin:' + preset.id, preset }));
  return [...mine, ...builtin];
}

/** 分类胶囊上的数量：我的 = 云端（接口给出）+ 本机，内置 = 模板数，全部 = 两者之和。 */
export function projectScopeCounts(counts: PageCounts<'mine' | 'builtin'>): Record<ProjectScope, number> {
  const mine = counts.mine ?? 0, builtin = counts.builtin ?? 0;
  return { all: mine + builtin, builtin, mine };
}
