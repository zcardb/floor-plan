import type { Design, Wall } from './types';

export const isBearingWall = (wall: Wall) => wall.kind === 'bearing' || wall.loadBearing === true;
export const canEditWall = (design: Design, wall: Wall) => design.template === 'blank' && wall.kind === 'partition' && !isBearingWall(wall);
export const canDemolishWall = (wall: Wall) => !isBearingWall(wall) && (wall.kind === 'partition' || wall.kind === 'low');
export const openingIsLocked = (design: Design, wallId: string) => design.walls.some(w => w.id === wallId && isBearingWall(w));
export const wallKindName = (wall: Wall) => wall.kind === 'bearing' ? '承重墙' : wall.kind === 'exterior' ? '外围墙' : wall.kind === 'low' ? '矮墙' : '隔墙';

export function setWallBearing(design: Design, id: string, value: boolean): Design {
  const wall = design.walls.find(w => w.id === id);
  if (!wall) throw new Error('墙体不存在，请重新选择');
  if (wall.kind === 'bearing') throw new Error('原始承重墙已锁定，不能更改承重标记');
  if (design.demolished.includes(id)) throw new Error('请先撤销墙体拆除，再标记承重');
  if (isBearingWall(wall) === value) return design;
  return { ...design, walls: design.walls.map(w => w.id === id ? { ...w, loadBearing: value } : w) };
}
