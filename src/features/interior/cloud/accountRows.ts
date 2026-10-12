import type { Database } from '@/integrations/supabase/types';
import type { CustomFloor, CustomOpening, CustomWall, FloorPattern } from '../model/types';
import type { AccountItem } from '../model/accountCostEntries';
import { furnitureFromRow } from '../ai/furnitureRow';
import { validCustomFloor } from '../model/floorMaterials';
import { validCustomOpening, validCustomWall } from '../model/hardMaterials';

/** 账号库各表的一行 → 编辑器里的材料对象（无效行返回 null）。字段名与数据库列一致。 */
type Row = Record<string, unknown>;
const price = (value: unknown) => (value === null || value === undefined ? null : Number(value));

export function floorFromRow(r: Row): CustomFloor | null {
  const floor: CustomFloor = {
    key: String(r.floor_key), name: String(r.name), pattern: r.pattern as FloorPattern, color: String(r.color), price: price(r.price),
    ...(r.length === null || r.length === undefined || r.width === null || r.width === undefined ? {} : { length: Number(r.length), width: Number(r.width) }),
  };
  return validCustomFloor(floor) ? floor : null;
}

/** 墙面 / 屋面 / 吊顶同构：key 列名不同（wall_key / roof_key / ceiling_key）。 */
export function colorMaterialFromRow(r: Row, keyColumn: string): CustomWall | null {
  const item: CustomWall = { key: String(r[keyColumn]), name: String(r.name), color: String(r.color), price: price(r.price) };
  return validCustomWall(item) ? item : null;
}

export function openingFromRow(r: Row): CustomOpening | null {
  const opening: CustomOpening = {
    key: String(r.opening_key), name: String(r.name), kind: r.kind as CustomOpening['kind'],
    width: Number(r.width), height: Number(r.height), price: price(r.price),
  };
  return validCustomOpening(opening) ? opening : null;
}


/**
 * 账号库视图（interior_account_library）的一行 → 自建条目：家具与地面、墙面、门窗、屋面、吊顶。
 * 风格不在其中（见 styleFromRow）；种类不认识或数据不完整时返回 null。
 */
export function accountItemFromRow(kind: string | null, r: Row): AccountItem | null {
  switch (kind) {
    case 'furniture': return { kind, item: furnitureFromRow(r as Database['public']['Tables']['interior_furniture_catalog']['Row']) };
    case 'floor': { const item = floorFromRow(r); return item && { kind, item }; }
    case 'opening': { const item = openingFromRow(r); return item && { kind, item }; }
    case 'wall': case 'roof': case 'ceiling': { const item = colorMaterialFromRow(r, kind + '_key'); return item && { kind, item }; }
    default: return null;
  }
}
