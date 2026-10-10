import type { Design, Furniture, LibraryItem } from './types';

/** 账号家具库改动后同步到项目目录的字段；单价不在其中：账号默认价走成本设置，项目内改价以项目为准。 */
const CATALOG_FIELDS = ['name', 'category', 'type', 'shape', 'w', 'd', 'height', 'color', 'imageUrl', 'image3dUrl'] as const;
/** 已放置的家具同步的字段：只更新仍与旧目录一致的字段，项目里单独改过的（例如调过尺寸、换过颜色）保留。 */
const PLACED_FIELDS = ['name', 'type', 'shape', 'w', 'd', 'height', 'color', 'imageUrl'] as const;

const norm = (value: unknown) => (value === null || value === '' ? undefined : value);
const same = (a: unknown, b: unknown) => norm(a) === norm(b);

/**
 * 用账号家具库的最新版本更新项目：项目目录（customCatalog）里同 catalogId 的条目整体跟随，
 * 画布上已放置的同款家具只更新未在项目里单独改过的字段。没有变化时返回 null。
 */
export function syncAccountFurniture(design: Design, account: LibraryItem[]): Design | null {
  const byId = new Map(account.flatMap(item => (item.catalogId ? [[item.catalogId, item] as const] : [])));
  const updates = new Map<string, { before: LibraryItem; after: LibraryItem }>();
  const customCatalog = design.customCatalog?.map(entry => {
    const source = entry.catalogId ? byId.get(entry.catalogId) : undefined;
    if (!source || CATALOG_FIELDS.every(key => same(entry[key], source[key]))) return entry;
    const after: LibraryItem = { ...entry };
    for (const key of CATALOG_FIELDS) Object.assign(after, { [key]: norm(source[key]) });
    updates.set(entry.catalogId!, { before: entry, after });
    return after;
  });
  if (!updates.size) return null;
  const furniture = design.furniture.map((placed): Furniture => {
    const update = placed.catalogId ? updates.get(placed.catalogId) : undefined;
    if (!update) return placed;
    const next = { ...placed };
    for (const key of PLACED_FIELDS) if (same(placed[key], update.before[key])) Object.assign(next, { [key]: norm(update.after[key]) });
    return next;
  });
  return { ...design, customCatalog, furniture };
}
