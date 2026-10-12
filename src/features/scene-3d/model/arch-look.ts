import type { DecorStyle } from "@/lib/floor-plan/decor-styles";
import { doorType } from "@/lib/floor-plan/door-type";
import { inRoom } from "@/lib/floor-plan/geometry";
import type { Opening, Point, Room, Wall } from "@/lib/floor-plan/types";

/**
 * 硬装在 3D 里的配色：风格只决定墙面与门扇，其余沿用参考实现的固定取值。
 * 用户单独刷过颜色的墙始终保留自己的颜色。
 */

/** 墙顶压顶（剖切面）的深色，让俯视时墙体轮廓清楚。 */
export const WALL_CAP = "#34312d";
/** 天花：不随风格变的暖白，夜里映出吸顶灯的光。 */
export const CEILING = "#fbfaf7";
/** 入户门比室内门更深。 */
export const ENTRY_DOOR = "#6b4f3a";
/** 窗框：深灰铝型材。 */
export const WINDOW_FRAME = { color: "#5d6166", roughness: 0.5, metalness: 0.4 } as const;

export const wallColor = (wall: Pick<Wall, "color">, style: DecorStyle) => wall.color || style.wall;

/**
 * 入户门：外围墙上的平开 / 双开门，并且门一侧在房间里、另一侧不属于任何房间（通向户外或公共走道）。
 * 通往阳台的门两侧都是房间，推拉门多通阳台，都不算。
 */
export function isEntryDoor(wall: Wall, opening: Opening, rooms: Room[]) {
  if (opening.kind !== "door" || doorType(opening) === "sliding" || wall.kind !== "exterior") return false;
  const L = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]);
  if (!L) return false;
  const ux = (wall.b[0] - wall.a[0]) / L,
    uy = (wall.b[1] - wall.a[1]) / L,
    probe = wall.thickness / 2 + 150,
    cx = wall.a[0] + ux * opening.offset,
    cy = wall.a[1] + uy * opening.offset;
  const indoor = (s: number) => {
    const p: Point = [cx - uy * probe * s, cy + ux * probe * s];
    return rooms.some((r) => inRoom(p, r));
  };
  return indoor(1) !== indoor(-1);
}

export const doorColor = (style: DecorStyle, entry: boolean) => (entry ? ENTRY_DOOR : style.door);
