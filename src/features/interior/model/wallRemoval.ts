import { rebuildRooms } from './geometry';
import { canDemolishWall, canEditWall } from './wallPolicy';
import type { Design } from './types';

/** 真实删除空白户型自绘的隔墙及其门窗，并重建房间；参考户型的原始墙体不可删除。 */
export function removeWall(design: Design, wallId: string): Design {
  const wall = design.walls.find((w) => w.id === wallId);
  if (!wall || !canEditWall(design, wall)) throw new Error('此墙体不可删除');
  return rebuildRooms({
    ...design,
    walls: design.walls.filter((w) => w.id !== wallId),
    openings: design.openings.filter((o) => o.wallId !== wallId),
    demolished: design.demolished.filter((id) => id !== wallId),
  });
}

/** 拆除标注开关：非承重墙与矮墙可标记/撤销拆除，承重墙与建筑外墙不可拆除。 */
export function toggleWallDemolition(design: Design, wallId: string): Design {
  const wall = design.walls.find((w) => w.id === wallId);
  if (!wall || !canDemolishWall(wall)) throw new Error('承重墙和建筑外墙不可拆除');
  const demolished = design.demolished.includes(wallId)
    ? design.demolished.filter((id) => id !== wallId)
    : [...design.demolished, wallId];
  return rebuildRooms({ ...design, demolished });
}
