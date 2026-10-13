import type { Json } from '@/lib/backend';
import type { CustomFloor, CustomOpening, CustomWall, LibraryItem } from '@/lib/floor-plan/types';
import { validFurnitureOutline, validFurnitureType } from '@/lib/floor-plan/furniture-appearance';
import { sanitizeModel3d } from '@/lib/floor-plan/furniture-3d';
import { backend, requireUserId } from '@/lib/backend';

/** 账号库写入：各类条目仍存各自的表（读取由视图 interior_account_library 合并），只有本人可写（RLS）。 */
const fail = (error: { message: string } | null) => { if (error) throw new Error(error.message); };

export async function saveAccountFurniture(item: LibraryItem) {
  if (!validFurnitureType(item.type) || !validFurnitureOutline(item.shape)) throw new Error('参考类型或外形无效');
  const { error } = await (await backend()).from('interior_furniture_catalog').upsert({
    owner_id: await requireUserId(), catalog_id: item.catalogId!, name: item.name, category: item.category, type: item.type, shape: item.shape ?? null,
    width: item.w, depth: item.d, height: item.height || 700, color: item.color, price: item.price ?? null,
    image_url: item.imageUrl || null, image_3d_url: item.image3dUrl || null, model_3d: (sanitizeModel3d(item.model3d) ?? null) as unknown as Json,
  }, { onConflict: 'owner_id,catalog_id' });
  fail(error);
  return true;
}

export async function removeAccountFurniture(catalogId: string) {
  const { error } = await (await backend()).from('interior_furniture_catalog').delete().eq('owner_id', await requireUserId()).eq('catalog_id', catalogId);
  fail(error);
  return true;
}

export async function saveAccountFloor(floor: CustomFloor) {
  const { error } = await (await backend()).from('interior_floor_catalog').upsert({
    owner_id: await requireUserId(), floor_key: floor.key, name: floor.name, pattern: floor.pattern,
    length: floor.length ?? null, width: floor.width ?? null, color: floor.color, price: floor.price,
  }, { onConflict: 'owner_id,floor_key' });
  fail(error);
}

export async function saveAccountOpening(opening: CustomOpening) {
  const { error } = await (await backend()).from('interior_opening_catalog').upsert({
    owner_id: await requireUserId(), opening_key: opening.key, name: opening.name, kind: opening.kind,
    width: opening.width, height: opening.height, price: opening.price,
  }, { onConflict: 'owner_id,opening_key' });
  fail(error);
}

/** 墙面 / 屋面 / 吊顶同构：key + 名称 + 颜色 + 单价。 */
const colorTables = {
  wall: { table: 'interior_wall_catalog', key: 'wall_key' },
  roof: { table: 'interior_roof_catalog', key: 'roof_key' },
  ceiling: { table: 'interior_ceiling_catalog', key: 'ceiling_key' },
} as const;
export type ColorMaterialKind = keyof typeof colorTables;

export async function saveAccountColorMaterial(kind: ColorMaterialKind, item: CustomWall) {
  const { table, key } = colorTables[kind];
  const row = { owner_id: await requireUserId(), [key]: item.key, name: item.name, color: item.color, price: item.price };
  const { error } = await (await backend()).from(table).upsert(row as never, { onConflict: 'owner_id,' + key });
  fail(error);
}

/** 硬装各类的保存入口（查看弹窗、新建弹窗共用）。 */
export const accountMaterialSaves = {
  floor: saveAccountFloor,
  opening: saveAccountOpening,
  wall: (item: CustomWall) => saveAccountColorMaterial('wall', item),
  roof: (item: CustomWall) => saveAccountColorMaterial('roof', item),
  ceiling: (item: CustomWall) => saveAccountColorMaterial('ceiling', item),
};
