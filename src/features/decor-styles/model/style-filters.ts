import type { Chip } from "@/components/cms/cms-filter-bar";
import { countBy, type PageCounts } from "@/lib/paging";
import { DECOR_CATEGORIES, matchStyle, type DecorStyle } from "@/lib/floor-plan/decor-styles";

/** 风格分类筛选的两个特殊项：全部、我的（账号自建）。其余项就是风格大类。 */
export const STYLE_ALL = "全部";
export const STYLE_MINE = "我的";

export type StyleFilter = { query: string; category: string };

/**
 * 筛选胶囊的数量：各大类的条数之外，再算出「全部」（我的风格一侧另有「我的」）。
 * 我的风格由数据库按大类统计（未归类的计在空串下），内置风格在本地统计，两份各自补齐后相加。
 */
export function styleCounts(byCategory: PageCounts, { mine }: { mine: boolean }): PageCounts {
  const all = Object.values(byCategory).reduce<number>((sum, count) => sum + (count ?? 0), 0);
  return { ...byCategory, [STYLE_ALL]: all, ...(mine ? { [STYLE_MINE]: all } : {}) };
}

/** 一组已在内存里的风格的分类数量。 */
export const countStyles = (styles: readonly DecorStyle[], { mine }: { mine: boolean }) =>
  styleCounts(countBy(styles, (s) => s.category ?? ""), { mine });

/** 分类条：全部 →（有自建风格时）我的 → 19 个大类，每项带数量；没有风格的大类不显示。 */
export function styleChips(counts: PageCounts): Chip[] {
  const chip = (id: string) => ({ id, label: id, meta: String(counts[id] ?? 0) });
  return [
    chip(STYLE_ALL),
    ...(counts[STYLE_MINE] ? [chip(STYLE_MINE)] : []),
    ...DECOR_CATEGORIES.filter((c) => counts[c]).map(chip),
  ];
}

/**
 * 一组风格（我的或内置）按分类与关键词筛选：有关键词时在这一组里全部搜、忽略分类；
 * 「我的」只留我的风格。
 */
export function filterStyleGroup(styles: readonly DecorStyle[], { query, category }: StyleFilter, { mine }: { mine: boolean }): DecorStyle[] {
  if (query.trim()) return styles.filter((s) => matchStyle(s, query));
  if (category === STYLE_ALL || category === STYLE_MINE) return mine || category === STYLE_ALL ? [...styles] : [];
  return styles.filter((s) => s.category === category);
}

/** 两组都在内存里时（编辑器侧栏）：我的风格在前、内置风格在后。 */
export const filterStyles = (builtins: readonly DecorStyle[], mine: readonly DecorStyle[], filter: StyleFilter): DecorStyle[] =>
  [...filterStyleGroup(mine, filter, { mine: true }), ...filterStyleGroup(builtins, filter, { mine: false })];
