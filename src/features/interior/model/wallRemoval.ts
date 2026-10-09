import { rebuildRooms } from './geometry';
import { dropOpenRooms } from './roomEnclosure';
import { canDeleteWall } from './wallPolicy';
import type { Design } from './types';

/** 删除墙体及墙上门窗并重建房间；墙体围不成闭环的区域不再是房间。承重墙需先取消承重标记。 */
export function removeWall(design: Design, wallId: string): Design {
  const wall = design.walls.find((w) => w.id === wallId);
  if (!wall) throw new Error('墙体不存在，请重新选择');
  if (!canDeleteWall(wall)) throw new Error('承重墙不可删除，请先取消承重标记');
  if (design.walls.length <= 1) throw new Error('至少保留一面墙体');
  return dropOpenRooms(rebuildRooms({
    ...design,
    walls: design.walls.filter((w) => w.id !== wallId),
    openings: design.openings.filter((o) => o.wallId !== wallId),
  }));
}

/** 旧版「标记拆除」已移除：加载时直接删掉被标记的墙及墙上门窗。 */
export function purgeDemolished(design: Design): Design {
  const ids = new Set(design.demolished);
  return {
    ...design,
    walls: design.walls.filter((w) => !ids.has(w.id)),
    openings: design.openings.filter((o) => !ids.has(o.wallId)),
    demolished: [],
  };
}
