import { syncRooms } from './roomFollow';
import { healSplitsAround } from './wallHeal';
import { canDeleteWall } from './wallPolicy';
import type { Design } from './types';

/**
 * 删除墙体及墙上门窗。
 * 房间随后按「墙 + 分隔线」重算：墙两侧的房间并成一间（属性取重叠最大的那间），
 * 不再被围住的房间连同里面的家具一起删除；一间房都不剩时拒绝删除。
 * 承重墙需先取消承重标记。
 */
export function removeWall(design: Design, wallId: string): Design {
  const wall = design.walls.find((w) => w.id === wallId);
  if (!wall) throw new Error('墙体不存在，请重新选择');
  if (!canDeleteWall(wall)) throw new Error('承重墙不可删除，请先取消承重标记');
  if (design.walls.length <= 1) throw new Error('至少保留一面墙体');
  // 相连墙上因这面墙留下的分割点一并清除（共线、属性一致的两段合并回一整面墙）。
  const next = syncRooms(design, healSplitsAround({
    ...design,
    walls: design.walls.filter((w) => w.id !== wallId),
    openings: design.openings.filter((o) => o.wallId !== wallId),
  }, wall));
  if (!next.rooms.length) throw new Error('删除后将没有房间，无法删除这面墙');
  return next;
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
