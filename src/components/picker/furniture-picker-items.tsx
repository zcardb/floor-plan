import { FurnitureShape } from "@/components/furniture-shape/furniture-shape";
import { formatMeters } from "@/lib/floor-plan/length-units";
import { isBuiltinItem, library } from "@/lib/floor-plan/catalog";
import type { LibraryItem } from "@/lib/floor-plan/types";
import type { PickerItem } from "./picker-items";

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
