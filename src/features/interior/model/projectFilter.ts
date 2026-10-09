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

/**
 * 滚动加载的可见窗口：取前 visible 条。
 * 云端还有未加载的项目时，内置模板（排在我的项目之后）先不露出，避免新加载的项目插到它们前面造成跳动。
 */
export function visibleEntries(entries: readonly ProjectEntry[], visible: number, cloudHasMore: boolean) {
  const available = cloudHasMore ? entries.filter(e => e.kind === 'mine') : entries;
  return { items: available.slice(0, visible), available: available.length };
}
