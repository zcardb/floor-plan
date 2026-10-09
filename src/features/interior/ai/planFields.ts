import { formatMeters } from "../model/lengthUnits";

/** 高级设计里长宽的可填范围（mm）；留空则由 AI 决定。 */
export const AI_SIZE_LIMITS = { min: 3000, max: 40000 } as const;
/** 房间数量上限：客厅 / 餐厅合并成「厅」。 */
export const AI_ROOM_LIMITS = { bedrooms: 6, livingRooms: 3, bathrooms: 4 } as const;

export type RoomCounts = { bedrooms: string; livingRooms: string; bathrooms: string };

const filled = (v: string) => v.trim() !== "" && Number(v) > 0;

/** 高级设计的摘要，例如「长 10.00 m · 宽 8.00 m · 3 卧 2 厅 1 卫」；都没填时返回空串。 */
export function advancedLabel(size: { width: number; depth: number }, rooms: RoomCounts): string {
  const counts = [filled(rooms.bedrooms) ? `${rooms.bedrooms} 卧` : "", filled(rooms.livingRooms) ? `${rooms.livingRooms} 厅` : "", filled(rooms.bathrooms) ? `${rooms.bathrooms} 卫` : ""].filter(Boolean).join(" ");
  return [
    Number.isFinite(size.width) ? `长 ${formatMeters(size.width)} m` : "",
    Number.isFinite(size.depth) ? `宽 ${formatMeters(size.depth)} m` : "",
    counts,
  ].filter(Boolean).join(" · ");
}

/** 把填写的长宽与房间数量拼成行，交给后端并入提示词。 */
export function planHints(rooms: RoomCounts): string[] {
  const parts = [
    filled(rooms.bedrooms) ? `卧室 ${rooms.bedrooms} 间` : "",
    filled(rooms.livingRooms) ? `厅 ${rooms.livingRooms} 个（客厅、餐厅等）` : "",
    filled(rooms.bathrooms) ? `卫生间 ${rooms.bathrooms} 间` : "",
  ].filter(Boolean);
  return parts.length ? [`房间数量必须是：${parts.join("，")}；房间名称与功能对应`] : [];
}

