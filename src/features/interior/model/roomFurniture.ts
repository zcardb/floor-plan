import { inRoom } from './geometry';
import type { Design, Furniture, Room } from './types';

const inside = (f: Furniture, room: Room) => inRoom([f.cx, f.cy], room);

/** 删除房间（地板）及中心点落在该房间内的家具；墙保持不动。 */
export function removeRoom(d: Design, roomId: string): Design {
  const room = d.rooms.find(r => r.id === roomId);
  if (!room) throw new Error('房间不存在，请重新选择');
  if (d.rooms.length <= 1) throw new Error('至少保留一个房间');
  return {
    ...d,
    rooms: d.rooms.filter(r => r.id !== roomId),
    furniture: d.furniture.filter(f => !inside(f, room)),
  };
}

/** 编辑前中心点在某个房间里、编辑后不在任何房间里的家具一并删除（被删房间里的家具）。 */
export function dropOrphanFurniture(before: Design, after: Design): Design {
  const previous = new Map(before.furniture.map(f => [f.id, f]));
  const furniture = after.furniture.filter(f => {
    const old = previous.get(f.id) ?? f;
    return !before.rooms.some(r => inside(old, r)) || after.rooms.some(r => inside(f, r));
  });
  return furniture.length === after.furniture.length ? after : { ...after, furniture };
}
