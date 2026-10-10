import type { Design, Furniture, LibraryItem } from './types';

/** 账号家具库改动后同步到项目目录的字段；单价不在其中：账号默认价走成本设置，项目内改价以项目为准。 */
const CATALOG_FIELDS = ['name', 'category', 'type', 'shape', 'w', 'd', 'height', 'color', 'imageUrl', 'image3dUrl', 'model3d'] as const;
/** 已放置的家具同步的字段：只更新仍与旧目录一致的字段，项目里单独改过的（例如调过尺寸、换过颜色）保留。 */
const PLACED_FIELDS = ['name', 'type', 'shape', 'w', 'd', 'height', 'color', 'imageUrl', 'model3d'] as const;

const norm = (value: unknown) => (value === null || value === '' ? undefined : value);
/** 3D 模型是对象，每次读取都是新实例，必须按内容比较。 */
const same = (a: unknown, b: unknown) => {
  const [x, y] = [norm(a), norm(b)];
  return x === y || (typeof x === 'object' && typeof y === 'object' && JSON.stringify(x) === JSON.stringify(y));
};

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

type MaterialLists = Pick<Design, 'customFloors' | 'customWalls' | 'customOpenings' | 'customRoofs' | 'customCeilings'>;
type MaterialItem = { key: string; price: number | null };

/** 同 key 的项目副本跟随账号库的名称 / 颜色 / 尺寸等；单价保留项目副本的值（账号默认价与项目改价另有规则）。 */
function syncList<T extends MaterialItem>(project: T[] | undefined, account: T[] | undefined): T[] | undefined {
  if (!project?.length || !account?.length) return project;
  const byKey = new Map(account.map(item => [item.key, item]));
  let changed = false;
  const next = project.map(item => {
    const source = byKey.get(item.key);
    if (!source) return item;
    const merged = { ...source, price: item.price } as T;
    const keys = new Set([...Object.keys(item), ...Object.keys(merged)]) as Set<keyof T>;
    if ([...keys].every(key => same(item[key], merged[key]))) return item;
    changed = true;
    return merged;
  });
  return changed ? next : project;
}

/** 账号硬装库（地面 / 墙面 / 门窗 / 屋面 / 吊顶）改动同步到项目副本；没有变化时返回 null。 */
export function syncAccountMaterials(design: Design, account: MaterialLists): Design | null {
  const keys = ['customFloors', 'customWalls', 'customOpenings', 'customRoofs', 'customCeilings'] as const;
  const next: Design = { ...design };
  let changed = false;
  for (const key of keys) {
    const list = syncList<MaterialItem>(design[key], account[key]);
    if (list !== design[key]) { Object.assign(next, { [key]: list }); changed = true; }
  }
  return changed ? next : null;
}
