import { deriveRooms } from './roomDerive';
import { dropOrphanFurniture } from './roomFurniture';
import { followSeparators, migrateSeparators } from './separators';
import type { Design } from './types';

/**
 * 改墙后的房间同步：分隔线端点先跟着移动的墙面伸缩，再由「墙 + 分隔线」重算全部房间
 * （名称、材质按重叠沿用），最后删掉落在已消失房间里的家具。
 * 结构没变时返回 after 本身。
 */
export function syncRooms(before: Design, after: Design): Design {
  // 旧数据：分隔线按改动前的房间轮廓迁移，再参与这次同步。
  if (!after.separators) {
    const migrated = migrateSeparators(before);
    before = migrated;
    after = { ...after, separators: migrated.separators };
  }
  const followed = followSeparators(before, after);
  const derived = deriveRooms(followed, after.rooms);
  return derived === after ? after : dropOrphanFurniture(before, derived);
}
