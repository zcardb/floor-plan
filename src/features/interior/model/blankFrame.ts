import { outerWalls } from './geometry';
import { deriveRooms } from './roomDerive';
import type { Design } from './types';
import { isBearingWall } from './wallPolicy';

/** 空白户型的外围墙是否仍是外框矩形（尺寸 = width / depth / thickness）。 */
export const BLANK_FRAME_CHANGED = "外围墙已单独调整，当前不支持整体重设外围尺寸";
/**
 * 外围墙被单独移动、改厚、分割或删除后为 false，此时不能再整体重设外围尺寸。
 */
export function blankFrameIntact(d: Design): boolean {
  const expected = outerWalls(d.width, d.depth, d.thickness);
  return expected.every((want) => {
    const wall = d.walls.find((w) => w.id === want.id);
    return !!wall && wall.kind === "exterior" && !wall.exteriorRootId && !d.demolished.includes(wall.id) &&
      wall.thickness === want.thickness &&
      wall.a[0] === want.a[0] && wall.a[1] === want.a[1] && wall.b[0] === want.b[0] && wall.b[1] === want.b[1];
  });
}
export function resizeBlank(
  d: Design,
  width: number,
  depth: number,
  thickness: number,
): Design {
  if (!blankFrameIntact(d)) {
    if (width !== d.width || depth !== d.depth || thickness !== d.thickness)
      throw new Error(BLANK_FRAME_CHANGED);
    return d;
  }
  const exterior = outerWalls(width, depth, thickness).map(w => {
    const previous = d.walls.find(old => old.id === w.id && old.kind === 'exterior');
    if (previous && isBearingWall(previous) && (JSON.stringify(previous.a) !== JSON.stringify(w.a) || JSON.stringify(previous.b) !== JSON.stringify(w.b) || previous.thickness !== w.thickness))
      throw new Error('户型调整会改变已标记承重的外围墙，请先核实结构');
    return previous ? { ...previous, ...w } : w;
  });
  if (d.walls.some(w => w.kind !== 'exterior' && isBearingWall(w) && [w.a, w.b].some(p => p[0] < 0 || p[1] < 0 || p[0] > width || p[1] > depth)))
    throw new Error('缩小户型会使承重墙超出边界');
  return deriveRooms({ ...d, width, depth, thickness, walls: [...exterior, ...d.walls.filter(w => w.kind !== 'exterior')] });
}
