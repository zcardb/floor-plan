import { bbox, ringArea } from './geometry';
import type { Design, Point, Room } from './types';

/** 面积超过这个值（m²）的洞按真实空洞保留：井道、庭院、大柱位都可能比它大。 */
const MAX_STRAY_AREA = 0.5;
/** 碎块的短边最多是「墙厚量级」（并与项目墙厚取大者），真实空洞不会只有一层墙那么窄。 */
const MIN_STRAY_WIDTH = 200;
/** 短边 / 长边 超过该值算方正（柱位），不算细缝，保留。 */
const MAX_STRAY_RATIO = 0.5;

/**
 * 洞环是不是「墙垛碎块」：删墙并房、画墙切房时用 polygon-clipping 求差，被删墙的一小截墙带
 * 会留在房间里，成为房间轮廓的第二个环（洞）。这种洞不是对象，点不中、也没有删除入口。
 * 三条同时满足才算碎块：面积 < 0.5 m²、短边 ≤ max(200, 项目墙厚)、短边 / 长边 ≤ 0.5。
 * 240×240 的柱位（1:1）与 ≥ 0.5 m² 的井道都不满足，照旧保留。
 */
export function isStrayHole(ring: Point[], wallThickness = MIN_STRAY_WIDTH): boolean {
  if (ring.length < 3 || ringArea(ring) / 1e6 >= MAX_STRAY_AREA) return false;
  const b = bbox(ring),
    w = b.x2 - b.x,
    h = b.y2 - b.y;
  const short = Math.min(w, h),
    long = Math.max(w, h);
  return (
    long > 0 &&
    short <= Math.max(MIN_STRAY_WIDTH, wallThickness) &&
    short / long <= MAX_STRAY_RATIO
  );
}

/** 丢掉墙垛碎块形态的洞环；所有房间都没变化时返回原数组（保持引用相等语义）。 */
export function stripStrayHoleRooms(rooms: Room[], wallThickness: number): Room[] {
  let changed = false;
  const next = rooms.map((room) => {
    if (!room.rings.length) return room;
    const rings = [
      room.rings[0]!,
      ...room.rings.slice(1).filter((ring) => !isStrayHole(ring, wallThickness)),
    ];
    if (rings.length === room.rings.length) return room;
    changed = true;
    return { ...room, rings };
  });
  return changed ? next : rooms;
}

/** 整个方案过一遍房间轮廓清理（无变化时返回原对象）。 */
export function stripStrayHoles(design: Design): Design {
  const rooms = stripStrayHoleRooms(design.rooms, design.thickness);
  return rooms === design.rooms ? design : { ...design, rooms };
}
