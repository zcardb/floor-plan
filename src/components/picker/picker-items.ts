import type { ReactNode } from "react";

/** 选择器条目：家具、参考类型等都映射成这一种形状。 */
export interface PickerItem {
  id: string;
  label: string;
  group: string;
  /** 右侧的辅助信息，例如尺寸。 */
  hint?: string;
  /** 来源角标，例如「账号库」。 */
  badge?: string;
  /** 额外的搜索关键词（类型、英文名等）。 */
  keywords?: string[];
  visual?: ReactNode;
}

/** 按名称 / 分组 / 角标 / 关键词匹配，不区分大小写；空关键词返回全部。 */
export function filterPickerItems(items: PickerItem[], query: string): PickerItem[] {
  const keyword = query.trim().toLocaleLowerCase();
  if (!keyword) return items;
  return items.filter((item) =>
    [item.label, item.group, item.badge ?? "", ...(item.keywords ?? [])].some((field) => field.toLocaleLowerCase().includes(keyword)),
  );
}

/** 保持首次出现的顺序分组（调用方已按分类排好序）。 */
export function groupPickerItems(items: PickerItem[]): [string, PickerItem[]][] {
  const groups = new Map<string, PickerItem[]>();
  for (const item of items) groups.set(item.group, [...(groups.get(item.group) ?? []), item]);
  return [...groups];
}
