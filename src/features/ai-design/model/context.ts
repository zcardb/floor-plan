import { openingRoomIds } from "@/lib/floor-plan/costs";
import { area, bbox, inRoom, length } from "@/lib/floor-plan/geometry";
import { openingSill } from "@/lib/floor-plan/hard-materials";
import { aiRoomGeometry, roomLayout } from "@/lib/floor-plan/layout-rules";
import type { Design, Furniture, Point, Room } from "@/lib/floor-plan/types";
import type { AiEdge, AiPlanSnapshot, AiRoomContext } from "../types";

const round = (n: number) => Math.round(n);
const point = ([x, y]: Point): [number, number] => [round(x), round(y)];
/** 发给模型的其他房间家具上限：足够判断风格与动线，又不至于撑大请求。 */
const SNAPSHOT_FURNITURE_LIMIT = 120;

const openingCenter = (d: Design, wallId: string, offset: number): Point | null => {
  const w = d.walls.find((wall) => wall.id === wallId);
  if (!w) return null;
  const L = length(w);
  if (!L) return null;
  return [w.a[0] + ((w.b[0] - w.a[0]) * offset) / L, w.a[1] + ((w.b[1] - w.a[1]) * offset) / L];
};

/** 房间内的家具（按中心点归属）。 */
export const furnitureInRoom = (d: Design, room: Room): Furniture[] =>
  d.furniture.filter((f) => inRoom([f.cx, f.cy], room));

/** 房间净空外接矩形，即家具摆放分区。 */
export function roomZone(room: Room): [number, number, number, number] {
  const b = bbox(room.rings[0]);
  return [round(b.x), round(b.y), round(b.x2), round(b.y2)];
}

/**
 * 整套户型快照：外轮廓、全部墙体、门窗（含门连通的房间）、所有房间轮廓，
 * 以及目标房间之外的家具。房间布局必须带上它，避免把房间孤立起来设计。
 */
export function planSnapshot(d: Design, targetRoomId?: string): AiPlanSnapshot {
  const names = new Map(d.rooms.map((r) => [r.id, r.name]));
  const walls = d.walls
    .filter((w) => !d.demolished.includes(w.id))
    .map((w) => ({ a: point(w.a), b: point(w.b), thickness: round(w.thickness), kind: w.kind }));
  const openings = d.openings.flatMap((o) => {
    const at = openingCenter(d, o.wallId, o.offset);
    if (!at) return [];
    return [{ kind: o.kind, at: point(at), width: round(o.width), rooms: openingRoomIds(d, o).map((id) => names.get(id) ?? id) }];
  });
  const furniture = d.rooms
    .filter((r) => r.id !== targetRoomId)
    .flatMap((r) =>
      furnitureInRoom(d, r).map((f) => ({ room: r.name, name: f.name, cx: round(f.cx), cy: round(f.cy), w: round(f.w), d: round(f.d), rot: round(f.rot) })),
    )
    .slice(0, SNAPSHOT_FURNITURE_LIMIT);
  return {
    width: round(d.width),
    depth: round(d.depth),
    walls,
    openings,
    rooms: d.rooms.map((r) => ({ id: r.id, name: r.name, area: Number(area(r).toFixed(2)), ring: r.rings[0].map(point) })),
    furniture,
  };
}

/** 目标房间：摆放分区 + 落在房间边界上的门窗（换算成「哪条边 + 沿边位置」）+ 每条边背后的构造与保留区。 */
export function roomContext(d: Design, room: Room): AiRoomContext {
  const zone = roomZone(room);
  const [x1, y1, x2, y2] = zone;
  const openings = d.openings.flatMap((o) => {
    if (!openingRoomIds(d, o).includes(room.id)) return [];
    const at = openingCenter(d, o.wallId, o.offset);
    if (!at) return [];
    const distance: [AiEdge, number][] = [
      ["up", Math.abs(at[1] - y1)],
      ["down", Math.abs(at[1] - y2)],
      ["left", Math.abs(at[0] - x1)],
      ["right", Math.abs(at[0] - x2)],
    ];
    const edge = distance.sort((a, b) => a[1] - b[1])[0][0];
    const along = edge === "up" || edge === "down" ? at[0] - x1 : at[1] - y1;
    return [{ kind: o.kind, edge, along: round(along), width: round(o.width), ...(o.kind === "window" ? { sill: round(openingSill(o)) } : {}) }];
  });
  const geometry = aiRoomGeometry(roomLayout(d, room), [x1, y1]);
  return { roomId: room.id, name: room.name, area: Number(area(room).toFixed(2)), zone, openings, ...geometry };
}
