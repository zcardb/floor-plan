import type { Furniture, LibraryItem } from './types';

/** 家具库条目 → 画布家具模型：3D 预览与画布共用同一套程序化几何。 */
export const toFurnitureModel = (item: LibraryItem): Furniture => ({
  id: item.catalogId ?? item.type + item.name,
  type: item.type,
  shape: item.shape,
  name: item.name,
  cx: 0,
  cy: 0,
  w: item.w,
  d: item.d,
  rot: 0,
  color: item.color,
  height: item.height,
});
