import type { CustomFloor, CustomOpening, CustomWall, FloorPattern } from '../model/types';
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
