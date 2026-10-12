import type { Chip } from "./CmsFilterBar";
import { DECOR_CATEGORIES, matchStyle, type DecorStyle } from "../model/decorStyles";

/** 风格分类筛选的两个特殊项：全部、我的（账号自建）。其余项就是风格大类。 */
export const STYLE_ALL = "全部";
export const STYLE_MINE = "我的";

/** 分类条：全部 →（有自建风格时）我的 → 19 个大类，每项带数量；没有风格的大类不显示。 */
export function styleChips(builtins: DecorStyle[], mine: DecorStyle[]): Chip[] {
  const all = [...mine, ...builtins];
  return [
    { id: STYLE_ALL, label: STYLE_ALL, meta: String(all.length) },
    ...(mine.length ? [{ id: STYLE_MINE, label: STYLE_MINE, meta: String(mine.length) }] : []),
    ...DECOR_CATEGORIES.map((c) => ({ id: c as string, label: c as string, meta: String(all.filter((s) => s.category === c).length) }))
      .filter((chip) => chip.meta !== "0"),
  ];
}

/** 按分类与关键词筛选：有关键词时在全部风格里搜，忽略分类。自建风格排在前面。 */
export function filterStyles(builtins: DecorStyle[], mine: DecorStyle[], { query, category }: { query: string; category: string }): DecorStyle[] {
  const all = [...mine, ...builtins];
  if (query.trim()) return all.filter((s) => matchStyle(s, query));
  if (category === STYLE_MINE) return mine;
  if (category === STYLE_ALL) return all;
  return all.filter((s) => s.category === category);
}
