export type { FurnitureSpec } from "./floorplanBuilder";
import type { FurnitureSpec } from "./floorplanBuilder";

type Rect = [number, number, number, number];
/** 房间平面简写：[x, y, w, h]。 */
type Room = Rect;
const R = (x: number, y: number, w: number, h: number): Rect => [x, y, w, h];

export interface Plan {
  walls: [number, number, number, number][];
  openings: { wall: number; offset: number; width: number; kind: "door" | "window"; hinge?: "start" | "end"; swingSide?: -1 | 1 }[];
  rooms: Room[];
}

/** 房间地面材质：卧室木地板、厅区地砖、厨卫防滑砖。 */
export const PLAN_OF: Record<string, Plan> = {};

export const STUDIO = {
  width: 6600,
  depth: 10400,
  thickness: 240,
  rooms: {
    balcony: R(360, 0, 5880, 1200),
    living: R(360, 1200, 5880, 5400),
    kitchen: R(360, 6600, 1800, 2400),
    bathroom: R(2280, 6600, 1920, 2000),
    bedroom: R(360, 9000, 5880, 1160),
  },
  walls: [
    [2280, 8640, 6600, 9000, "e"] as unknown as Rect,
  ],
};

void PLAN_OF;
void STUDIO;
void R;
export const EMPTY_FURNITURE: FurnitureSpec[] = [];
