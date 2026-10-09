import { rebuildRooms } from './geometry';
import { dropOpenRooms } from './roomEnclosure';
import { dropOrphanFurniture } from './roomFurniture';
import { mergeRoomsAcrossWall } from './roomMerge';
import { canDeleteWall } from './wallPolicy';
import type { Design } from './types';

/**
 * 删除墙体及墙上门窗。
 * 墙两侧都有房间时，把两侧房间与这面墙的墙带并成一间（名称等属性取面积较大的那一间）；
 * 空白户型的房间按外框重算，删掉隔墙本来就连成一体。
 * 删墙后不再被墙围住的房间连同里面的家具一起删除；一间房都不剩时拒绝删除。
 * 承重墙需先取消承重标记。
 */
export function removeWall(design: Design, wallId: string): Design {
  const wall = design.walls.find((w) => w.id === wallId);
  if (!wall) throw new Error('墙体不存在，请重新选择');
  if (!canDeleteWall(wall)) throw new Error('承重墙不可删除，请先取消承重标记');
  if (design.walls.length <= 1) throw new Error('至少保留一面墙体');
  const after = rebuildRooms({
    ...design,
    walls: design.walls.filter((w) => w.id !== wallId),
    openings: design.openings.filter((o) => o.wallId !== wallId),
  });
  const merged = mergeRoomsAcrossWall(after, design, wall);
  const kept = dropOpenRooms(merged, design);
  if (!kept.rooms.length) throw new Error('删除后将没有房间，无法删除这面墙');
  return dropOrphanFurniture(design, kept);
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
