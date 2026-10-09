import type { ReactNode } from "react";
import { FurnitureShape } from "./FurnitureShape";
import { formatMeters } from "../model/lengthUnits";
import { isBuiltinItem } from "../ai/catalog";
import { library } from "../data/catalog";
import type { LibraryItem } from "../model/types";

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

const ACCOUNT_GROUP = "我的家具";

/** 家具 → 选择器条目：账号 / 项目家具单独成组并带角标，内置家具按分类分组。 */
export function furniturePickerItems(items: LibraryItem[]): PickerItem[] {
  const own = items.filter((item) => !isBuiltinItem(item)), builtin = items.filter(isBuiltinItem);
  return [...own, ...builtin].map((item) => ({
    id: item.catalogId || `${item.type}:${item.name}`,
    label: item.name,
    group: isBuiltinItem(item) ? item.category : ACCOUNT_GROUP,
    hint: `${formatMeters(item.w)} × ${formatMeters(item.d)} m`,
    badge: isBuiltinItem(item) ? undefined : "账号库",
    keywords: [item.category, item.type],
    visual: item.imageUrl
      ? <img src={item.imageUrl} crossOrigin="anonymous" alt="" />
      : <svg viewBox={`${-item.w / 2 - 80} ${-item.d / 2 - 80} ${item.w + 160} ${item.d + 160}`} aria-hidden="true"><FurnitureShape f={item} /></svg>,
  }));
}

/** 「参考类型」选择项：首项为按名称自动匹配，其余每个类型一项，按素材库分类分组，可按类型下任意家具名搜索。 */
export function typePickerItems(types: { value: string; label: string }[], autoLabel: string): PickerItem[] {
  return [
    { id: "auto", label: `自动匹配 · ${autoLabel}`, group: "按名称匹配", keywords: ["自动", "auto"] },
    ...types.map(({ value, label }) => {
      const sample = library.find((item) => item.type === value);
      return {
        id: value,
        label,
        group: sample?.category ?? "其他",
        keywords: [value, ...library.filter((item) => item.type === value).map((item) => item.name)],
        visual: sample ? <svg viewBox={`${-sample.w / 2 - 80} ${-sample.d / 2 - 80} ${sample.w + 160} ${sample.d + 160}`} aria-hidden="true"><FurnitureShape f={sample} /></svg> : undefined,
      };
    }),
  ];
}
