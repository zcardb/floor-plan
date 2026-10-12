import { catalogIdOf, categories, library } from "../data/catalog";
import { furnitureHeight } from "../model/layoutRules";
import type { LibraryItem } from "../model/types";
import type { AiCatalog, AiCatalogEntry } from "./types";


const categoryRank = (category: string) => {
  const index = categories.indexOf(category);
  return index < 0 ? categories.length : index;
};

/**
 * AI 家具目录 = 项目家具 + 账号家具 + 内置素材库，每次请求现算。
 * 以后新增的家具只要进了这三处之一，下一次生成就能用，不用改提示词或后端。
 * 同一 catalogId 只保留一份（项目版本优先），按「分类 → 名称」稳定排序后分配 F1…Fn。
 */
export function buildAiCatalog({ project = [], account = [] }: { project?: LibraryItem[]; account?: LibraryItem[] } = {}): AiCatalog {
  const unique = new Map<string, LibraryItem>();
  for (const item of [...project, ...account, ...library]) {
    const id = catalogIdOf(item);
    if (!unique.has(id)) unique.set(id, { ...item, catalogId: id });
  }
  const items = [...unique.values()].sort(
    (a, b) =>
      categoryRank(a.category) - categoryRank(b.category) ||
      a.category.localeCompare(b.category, "zh") ||
      a.name.localeCompare(b.name, "zh") ||
      a.catalogId!.localeCompare(b.catalogId!),
  );
  const byCode = new Map<string, LibraryItem>();
  const codes = new Map<string, string>();
  const entries: AiCatalogEntry[] = items.map((item, i) => {
    const code = `F${i + 1}`;
    byCode.set(code, item);
    codes.set(item.catalogId!, code);
    return { code, catalogId: item.catalogId!, name: item.name, category: item.category, type: item.type, w: item.w, d: item.d, height: furnitureHeight(item) };
  });
  return { entries, byCode, byId: unique, codeOf: (catalogId) => codes.get(catalogId) };
}
