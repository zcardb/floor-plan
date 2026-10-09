import { library } from '../data/catalog';
import type { LibraryItem } from '../model/types';

/** 喂给模型的目录项：代号只在单次请求内有效。 */
export interface AiCatalogEntry {
  code: string;
  catalogId: string;
  name: string;
  category: string;
  type: string;
  w: number;
  d: number;
  /** 账号家具 / 项目家具的原始条目，落地时用来保留颜色与外形。 */
  source?: LibraryItem;
}

export interface AiCatalog {
  /** 发给模型的目录（不含 catalogId 与 source）。 */
  entries: Pick<AiCatalogEntry, 'code' | 'name' | 'category' | 'type' | 'w' | 'd'>[];
  /** 代号 → 目录项，用于把模型结果解析回家具素材。 */
  byCode: Map<string, AiCatalogEntry>;
}

export const CATALOG_CODE_PREFIX = 'F';

/**
 * 合并当前项目目录、账号家具库与内置素材库，按 catalogId 去重。
 * 每次请求现算：以后新增的家具只要进入这三处之一，下一次生成即可使用，
 * 不需要改提示词，也不需要重新部署后端。
 */
export function buildAiCatalog({ project = [], account = [] }: { project?: LibraryItem[]; account?: LibraryItem[] } = {}): AiCatalog {
  const seen = new Set<string>();
  const merged: AiCatalogEntry[] = [];
  // 项目目录优先于账号库（项目里的才是当前版本），账号库优先于内置库。
  for (const item of [...project, ...account, ...library]) {
    const catalogId = item.catalogId || `${item.type}:${item.name}`;
    if (seen.has(catalogId)) continue;
    seen.add(catalogId);
    merged.push({
      code: '',
      catalogId,
      name: item.name,
      category: item.category,
      type: item.type,
      w: Math.round(item.w),
      d: Math.round(item.d),
      source: item.catalogId ? item : undefined,
    });
  }
  merged.sort((a, b) =>
    a.category === b.category ? a.name.localeCompare(b.name, 'zh-Hans-CN') : a.category.localeCompare(b.category, 'zh-Hans-CN'),
  );
  const byCode = new Map<string, AiCatalogEntry>();
  const entries: AiCatalog['entries'] = [];
  merged.forEach((entry, i) => {
    entry.code = `${CATALOG_CODE_PREFIX}${i + 1}`;
    byCode.set(entry.code, entry);
    entries.push({ code: entry.code, name: entry.name, category: entry.category, type: entry.type, w: entry.w, d: entry.d });
  });
  return { entries, byCode };
}

/** 代号 → 目录项；未知代号返回 null，调用方据此丢弃该项。 */
export function resolveCode(catalog: AiCatalog, code: unknown): AiCatalogEntry | null {
  if (typeof code !== 'string') return null;
  const key = code.trim().toUpperCase();
  return catalog.byCode.get(key) ?? catalog.byCode.get(code.trim()) ?? null;
}

/** 目录项 → 可写进设计的素材对象（账号 / 项目家具保留颜色、外形与定价）。 */
export function catalogItemOf(entry: AiCatalogEntry): LibraryItem {
  const base: LibraryItem = entry.source ?? {
    type: entry.type,
    name: entry.name,
    category: entry.category,
    w: entry.w,
    d: entry.d,
    color: '#e8dccb',
  };
  return { ...base, catalogId: entry.catalogId, w: entry.w, d: entry.d };
}
