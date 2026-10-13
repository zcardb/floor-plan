import { library } from './catalog';
import type { Design, Furniture, LibraryItem } from './types';

/**
 * 内置家具的账号覆盖：账号家具库里与内置家具同 catalogId 的一行，覆盖名称、尺寸、颜色，
 * 以及 2D 俯视图与 3D 模型这组素材。分类与参考类型始终沿用内置值（它们决定家具类型与 2D 符号）。
 *
 * 覆盖行是「这一款家具在这个账号下的样子」：素材、名称、尺寸、颜色的修改都写进这一行，
 * 账号库里改动会体现在素材库、新放置的家具与详情卡片上。
 */
export const ASSET_FIELDS = ['imageUrl', 'image3dUrl', 'model3d'] as const;
/** 覆盖行里跟内置值走、由用户改动的字段（素材之外）。 */
export const FIELD_OVERRIDES = ['name', 'w', 'd', 'height', 'color'] as const;
export const OVERRIDE_FIELDS = [...FIELD_OVERRIDES, ...ASSET_FIELDS] as const;
type Assets = Pick<LibraryItem, typeof ASSET_FIELDS[number]>;
type Fields = Pick<LibraryItem, typeof FIELD_OVERRIDES[number]>;

const builtinById = new Map(library.map(item => [item.catalogId!, item]));
export const BUILTIN_IDS = [...builtinById.keys()];

export const builtinOf = (catalogId: string | undefined) => (catalogId ? builtinById.get(catalogId) : undefined);

const fieldsOf = (item: LibraryItem): Fields => ({ name: item.name, w: item.w, d: item.d, height: item.height, color: item.color });
const assetsOf = (item: Assets): Assets => ({ imageUrl: item.imageUrl, image3dUrl: item.image3dUrl, model3d: item.model3d });
const same = (a: Partial<LibraryItem>, b: Partial<LibraryItem>, keys: readonly string[]) =>
  keys.every(key => JSON.stringify(a[key as keyof LibraryItem] ?? null) === JSON.stringify(b[key as keyof LibraryItem] ?? null));

/** 已放置家具只带 imageUrl 与 model3d（没有 3D 效果图），按内容比较。 */
const samePlaced = (a: Assets, b: Assets) => (a.imageUrl ?? null) === (b.imageUrl ?? null) && JSON.stringify(a.model3d ?? null) === JSON.stringify(b.model3d ?? null);

/** 内置家具 + 账号覆盖的名称、尺寸、颜色与素材（没有覆盖时就是内置家具本身）。 */
export function withBuiltinAssets(builtin: LibraryItem, override: LibraryItem | undefined): LibraryItem {
  return override ? { ...builtin, ...fieldsOf(override), ...assetsOf(override) } : builtin;
}

/** 覆盖行里是否有内容与内置值不同（名称、尺寸、颜色或素材被调整过）。 */
export const assetsAdjusted = (builtin: LibraryItem, override: LibraryItem | undefined) =>
  !!override && !(same(builtin, override, FIELD_OVERRIDES) && same(assetsOf(builtin), override, ASSET_FIELDS));

/** 写入账号库的覆盖行：内置家具字段 + 覆盖的名称、尺寸、颜色与素材（没传的字段沿用内置值）。 */
export const overrideRow = (builtin: LibraryItem, fields: Partial<Fields & Assets>): LibraryItem =>
  ({ ...builtin, ...fieldsOf({ ...builtin, ...fields }), ...assetsOf(fields) });

/** 素材库列表：内置家具套上账号覆盖。 */
export function libraryWithOverrides(overrides: LibraryItem[]): LibraryItem[] {
  const byId = new Map(overrides.map(item => [item.catalogId, item]));
  return library.map(item => withBuiltinAssets(item, byId.get(item.catalogId)));
}

/**
 * 已放置的内置家具跟随账号覆盖，但**只同步素材字段**：项目里单独调过的尺寸、颜色、名称
 * 是这一个项目的效果，不该被账号库的改动抹掉。名称 / 尺寸 / 颜色的覆盖体现在新放置的家具上。
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
