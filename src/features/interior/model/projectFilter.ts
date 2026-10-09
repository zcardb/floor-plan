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

/**
 * 合并内置模板与我的项目，按分类与搜索词过滤。
 * 排序：我的项目按修改时间倒序；内置模板没有修改时间，固定排在其后并保持原顺序。
 */
export function filterProjects(presets: readonly TemplatePreset[], rows: readonly ProjectSummary[], scope: ProjectScope, query: string): ProjectEntry[] {
  const q = query.trim().toLowerCase();
  const mine: ProjectEntry[] = scope === 'builtin' ? [] : rows
    .filter(row => !q || includes(row.name, q))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(row => ({ kind: 'mine', key: 'mine:' + row.id, row }));
  const builtin: ProjectEntry[] = scope === 'mine' ? [] : presets
    .filter(p => !q || [p.name, p.layout, p.description].some(text => includes(text, q)))
    .map(preset => ({ kind: 'builtin', key: 'builtin:' + preset.id, preset }));
  return [...mine, ...builtin];
}

/** 页码序列：首尾页、当前页及其左右各一页，其余折叠为省略号。 */
export function pageNumbers(page: number, pages: number): (number | '…')[] {
  const keep = new Set([1, pages, page - 1, page, page + 1].filter(n => n >= 1 && n <= pages));
  const sorted = [...keep].sort((a, b) => a - b);
  return sorted.flatMap((n, i) => i && n - sorted[i - 1] > 1 ? ['…' as const, n] : [n]);
}

/** 页码从 1 开始；越界时修正到有效范围，空列表视为 1 页。 */
export function paginate<T>(list: readonly T[], page: number, size: number) {
  const pages = Math.max(1, Math.ceil(list.length / size));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  return { items: list.slice((current - 1) * size, current * size), page: current, pages };
}
