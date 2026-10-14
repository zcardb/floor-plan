import { furnitureHeight } from "@/lib/floor-plan/layout-rules";
import type { Furniture, LibraryItem } from "@/lib/floor-plan/types";

/** 家具库条目 → 场景家具：详情预览与画布 3D 场景用同一套程序化几何。 */
export const toFurnitureModel = (item: LibraryItem): Furniture => ({
  id: item.catalogId ?? item.type + item.name,
  type: item.type,
  shape: item.shape,
  model3d: item.model3d,
  name: item.name,
  cx: 0,
  cy: 0,
  w: item.w,
  d: item.d,
  rot: 0,
  color: item.color,
  height: furnitureHeight(item),
});
