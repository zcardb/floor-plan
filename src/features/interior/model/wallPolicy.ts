import type { Design, Wall } from './types';

/** 手动标记优先；参考户型原始承重墙默认承重，可被取消（loadBearing: false）。 */
export const isBearingWall = (wall: Wall) => wall.loadBearing ?? wall.kind === 'bearing';
export const canEditWall = (design: Design, wall: Wall) => design.template === 'blank' && wall.kind === 'partition' && !isBearingWall(wall);
/** 绘墙 / 门 / 窗入口：空白户型恒开放；其余项目只要不是只读预览（游客、复制、导入、旧项目）都开放。 */
export const canEditStructure = (design: Design, readOnly: boolean) => design.template === 'blank' || !readOnly;
/** 所有墙都可删除，承重墙除外（先取消承重标记）。 */
export const canDeleteWall = (wall: Wall) => !isBearingWall(wall);
/** 承重墙结构改动的统一提醒文案。 */
export const BEARING_WALL_WARNING = '承重墙改动仅用于方案示意，实际施工须经结构专业评估';
/** 可调整尺寸/位置的墙体。空白户型的房间由外框推导，外围墙尺寸只能走属性面板的整体重设，避免墙与房间脱节。 */
export const canResizeWall = (design: Design, wall: Wall) =>
  canEditWall(design, wall) ||
  (design.structureUnlocked === true && design.template !== 'blank' && !design.demolished.includes(wall.id));
/** 门窗始终可编辑；开在承重墙上时只做风险提醒。 */
export const isOnBearingWall = (design: Design, wallId: string) => design.walls.some(w => w.id === wallId && isBearingWall(w));
export const wallKindName = (wall: Wall) => wall.kind === 'bearing' ? '承重墙' : wall.kind === 'exterior' ? '外围墙' : wall.kind === 'low' ? '矮墙' : '隔墙';

/** 所有墙体都可标记/取消承重。 */
export function setWallBearing(design: Design, id: string, value: boolean): Design {
  const wall = design.walls.find(w => w.id === id);
  if (!wall) throw new Error('墙体不存在，请重新选择');
  if (isBearingWall(wall) === value) return design;
  return { ...design, walls: design.walls.map(w => w.id === id ? { ...w, loadBearing: value } : w) };
}
