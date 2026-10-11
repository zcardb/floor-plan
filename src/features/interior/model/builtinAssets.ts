import { library } from '../data/catalog';
import type { Design, Furniture, LibraryItem } from './types';

/**
 * 内置家具的素材覆盖：账号家具库里与内置家具同 catalogId 的一行只用来覆盖 2D 俯视图与 3D 模型，
 * 名称、尺寸、分类、单价始终沿用内置值。「恢复默认素材」即把这一行的素材写回内置值。
 */
export const ASSET_FIELDS = ['imageUrl', 'image3dUrl', 'model3d'] as const;
type Assets = Pick<LibraryItem, typeof ASSET_FIELDS[number]>;

const builtinById = new Map(library.map(item => [item.catalogId!, item]));
export const BUILTIN_IDS = [...builtinById.keys()];

export const builtinOf = (catalogId: string | undefined) => (catalogId ? builtinById.get(catalogId) : undefined);

const assetsOf = (item: Assets): Assets => ({ imageUrl: item.imageUrl, image3dUrl: item.image3dUrl, model3d: item.model3d });
const sameAssets = (a: Assets, b: Assets) => JSON.stringify(assetsOf(a)) === JSON.stringify(assetsOf(b));

/** 已放置家具只带 imageUrl 与 model3d（没有 3D 效果图），按内容比较。 */
const samePlaced = (a: Assets, b: Assets) => (a.imageUrl ?? null) === (b.imageUrl ?? null) && JSON.stringify(a.model3d ?? null) === JSON.stringify(b.model3d ?? null);

/** 内置家具 + 账号覆盖的素材（没有覆盖时就是内置家具本身）。 */
export function withBuiltinAssets(builtin: LibraryItem, override: Assets | undefined): LibraryItem {
  return override ? { ...builtin, ...assetsOf(override) } : builtin;
}

/** 素材是否已调整（与内置值不同）。 */
export const assetsAdjusted = (builtin: LibraryItem, override: Assets | undefined) => !!override && !sameAssets(builtin, override);

/** 写入账号库的覆盖行：内置家具字段 + 新素材。 */
export const overrideRow = (builtin: LibraryItem, assets: Assets): LibraryItem => ({ ...builtin, ...assetsOf(assets) });

/** 素材库列表：内置家具套上账号覆盖。 */
export function libraryWithOverrides(overrides: LibraryItem[]): LibraryItem[] {
  const byId = new Map(overrides.map(item => [item.catalogId, item]));
  return library.map(item => withBuiltinAssets(item, byId.get(item.catalogId)));
}

/**
 * 已放置的内置家具跟随账号覆盖，只改 2D / 3D 素材字段（其余字段与项目内的调整不动）。
 * 只处理账号库里有覆盖行的款式：账号库还没读回来或没有覆盖时不做任何事，避免把素材误清成默认值。
 * 「恢复默认素材」会把覆盖行写回内置素材，于是各项目也一并恢复。没有变化返回 null。
 */
export function syncBuiltinFurniture(design: Design, overrides: LibraryItem[]): Design | null {
  const byId = new Map(overrides.map(item => [item.catalogId, item]));
  let changed = false;
  const furniture = design.furniture.map((placed): Furniture => {
    const builtin = builtinOf(placed.catalogId), override = byId.get(placed.catalogId);
    if (!builtin || !override) return placed;
    const target = withBuiltinAssets(builtin, override);
    if (samePlaced(placed, target)) return placed;
    changed = true;
    const next: Furniture = { ...placed, imageUrl: target.imageUrl, model3d: target.model3d };
    if (!next.imageUrl) delete next.imageUrl;
    if (!next.model3d) delete next.model3d;
    return next;
  });
  return changed ? { ...design, furniture } : null;
}
