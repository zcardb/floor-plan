import type { Design, Furniture, Point, Room } from '../model/types';
import { bbox, center, inRoom, length, ringArea } from '../model/geometry';
import { buildAiCatalog, type AiCatalog } from './catalog';

export type AiSide = 'up' | 'down' | 'left' | 'right';

/** 房间上下文：目标房间的净空、门窗位置与现有家具。 */
export interface AiRoomContext {
  roomId: string;
  name: string;
  area: number;
  /** 净空矩形 [x1, y1, x2, y2]，同时也是家具摆放分区。 */
  zone: [number, number, number, number];
  w: number;
  d: number;
  doors: { edge: AiSide; at: number; width: number }[];
  windows: { edge: AiSide; at: number; width: number }[];
  existing: { code: string; name: string; cx: number; cy: number; w: number; d: number; rot: number }[];
}

/** 整套户型快照：房间布局不孤立，模型需要看到整体关系与动线。 */
export interface AiPlanContext {
  width: number;
  depth: number;
  walls: { id: string; a: Point; b: Point; t: number }[];
  openings: { kind: 'door' | 'window'; wallId: string; at: Point; width: number; connects: string[] }[];
  rooms: { id: string; name: string; poly: Point[]; area: number; mat: string }[];
  furniture: { roomId: string | null; code: string; name: string; cx: number; cy: number; w: number; d: number; rot: number }[];
  targetRoomId: string;
}

/** 家具总数超过该值时，只保留目标房间与相邻房间的家具，控制请求体积。 */
const MAX_CONTEXT_FURNITURE = 120;
/** 判断开口贴近哪条边时的容差。 */
const EDGE_TOLERANCE = 300;
/** 开口 / 家具归属房间时的外扩容差。 */
const NEAR_TOLERANCE = 200;

const round = (v: number) => Math.round(v);

/** 房间净空矩形与开间 / 进深。 */
export function zoneOf(room: Room): [number, number, number, number] {
  const b = bbox(room.rings[0] ?? []);
  return [round(b.x), round(b.y), round(b.x2), round(b.y2)];
}

export const areaOf = (room: Room) => Math.round(ringArea(room.rings[0] ?? []) / 10_000) / 100;

const inside = (p: Point, zone: [number, number, number, number], pad: number) => {
  const [x1, y1, x2, y2] = zone;
  return p[0] >= x1 - pad && p[0] <= x2 + pad && p[1] >= y1 - pad && p[1] <= y2 + pad;
};

const roomZoneOf = (room: Room): [number, number, number, number] => {
  const b = bbox(room.rings[0] ?? []);
  return [b.x, b.y, b.x2, b.y2];
};

/** 落点所在房间（含外墙外扩容差），找不到返回 null。 */
function roomIdAt(design: Design, p: Point): string | null {
  const hit = design.rooms.find((r) => inRoom(p, r));
  if (hit) return hit.id;
  return design.rooms.find((r) => inside(p, roomZoneOf(r), NEAR_TOLERANCE))?.id ?? null;
}

/** 开口所在墙的中点。 */
function openingPoint(design: Design, wallId: string, offset: number): Point | null {
  const wall = design.walls.find((w) => w.id === wallId);
  if (!wall) return null;
  const len = length(wall) || 1;
  const t = Math.min(1, Math.max(0, offset / len));
  return [wall.a[0] + (wall.b[0] - wall.a[0]) * t, wall.a[1] + (wall.b[1] - wall.a[1]) * t];
}

/** 开口贴近房间哪条边，以及沿墙位置（相对净空左上角）。 */
function edgeOf(p: Point, zone: [number, number, number, number]): { edge: AiSide; at: number } | null {
  const [x1, y1, x2, y2] = zone;
  const at = (side: AiSide) => (side === 'up' || side === 'down' ? p[0] - x1 : p[1] - y1);
  if (Math.abs(p[1] - y1) <= EDGE_TOLERANCE) return { edge: 'up', at: round(at('up')) };
  if (Math.abs(p[1] - y2) <= EDGE_TOLERANCE) return { edge: 'down', at: round(at('down')) };
  if (Math.abs(p[0] - x1) <= EDGE_TOLERANCE) return { edge: 'left', at: round(at('left')) };
  if (Math.abs(p[0] - x2) <= EDGE_TOLERANCE) return { edge: 'right', at: round(at('right')) };
  return null;
}

/** 房间内的家具。 */
export const furnitureInRoom = (design: Design, room: Room): Furniture[] =>
  design.furniture.filter((f) => inside([f.cx, f.cy], zoneOf(room), 0));

/** 目标房间的上下文。 */
export function roomContextOf(design: Design, room: Room): AiRoomContext {
  const zone = zoneOf(room);
  const [x1, y1, x2, y2] = zone;
  const doors: AiRoomContext['doors'] = [];
  const windows: AiRoomContext['windows'] = [];
  for (const o of design.openings) {
    const mid = openingPoint(design, o.wallId, o.offset);
    if (!mid || !inside(mid, zone, NEAR_TOLERANCE)) continue;
    const found = edgeOf(mid, zone);
    if (!found) continue;
    (o.kind === 'door' ? doors : windows).push({ edge: found.edge, at: found.at, width: round(o.width) });
  }
  return {
    roomId: room.id,
    name: room.name,
    area: areaOf(room),
    zone,
    w: x2 - x1,
    d: y2 - y1,
    doors,
    windows,
    existing: furnitureInRoom(design, room).map((f) => ({
      code: f.catalogId || f.type,
      name: f.name,
      cx: round(f.cx),
      cy: round(f.cy),
      w: round(f.w),
      d: round(f.d),
      rot: round(f.rot),
    })),
  };
}

/** 与目标房间相邻的房间 id（净空外扩后相交）。 */
function neighborIdsOf(design: Design, target: Room): Set<string> {
  const zone = roomZoneOf(target);
  return new Set(
    design.rooms
      .filter((r) => r.id !== target.id && inside(center(r), zone, 1200))
      .map((r) => r.id),
  );
}

/** 整套户型快照。 */
export function planContextOf(design: Design, room: Room, catalog: AiCatalog): AiPlanContext {
  const codeOfCatalogId = new Map<string, string>();
  for (const entry of catalog.byCode.values()) codeOfCatalogId.set(entry.catalogId, entry.code);
  const openings = design.openings.flatMap((o) => {
    const at = openingPoint(design, o.wallId, o.offset);
    if (!at) return [];
    return [{ kind: o.kind, wallId: o.wallId, at: [round(at[0]), round(at[1])] as Point, width: round(o.width), connects: [] as string[] }];
  });
  // 门落在两个房间之间时标出它连通哪两个房间，模型才能判断动线。
  for (const opening of openings) {
    if (opening.kind !== 'door') continue;
    opening.connects = design.rooms.filter((r) => inside(opening.at, roomZoneOf(r), NEAR_TOLERANCE)).slice(0, 2).map((r) => r.id);
  }
  const neighbors = neighborIdsOf(design, room);
  const trimmed = design.furniture.length > MAX_CONTEXT_FURNITURE
    ? design.furniture.filter((f) => {
        const id = roomIdAt(design, [f.cx, f.cy]);
        return id === null || id === room.id || neighbors.has(id);
      })
    : design.furniture;
  return {
    width: round(design.width),
    depth: round(design.depth),
    walls: design.walls.map((w) => ({ id: w.id, a: [round(w.a[0]), round(w.a[1])] as Point, b: [round(w.b[0]), round(w.b[1])] as Point, t: round(w.thickness) })),
    openings,
    rooms: design.rooms.map((r) => ({
      id: r.id,
      name: r.name,
      poly: (r.rings[0] ?? []).map((p) => [round(p[0]), round(p[1])] as Point),
      area: areaOf(r),
      mat: r.mat,
    })),
    furniture: trimmed.map((f) => ({
      roomId: roomIdAt(design, [f.cx, f.cy]),
      code: f.catalogId ? codeOfCatalogId.get(f.catalogId) ?? f.type : f.type,
      name: f.name,
      cx: round(f.cx),
      cy: round(f.cy),
      w: round(f.w),
      d: round(f.d),
      rot: round(f.rot),
    })),
    targetRoomId: room.id,
  };
}

/** 房间名 → 房间类型提示（UI 与提示词共用）。 */
export function roomKindOf(name: string): string {
  const rules: [RegExp, string][] = [
    [/主卧|主卧室/, '主卧'],
    [/儿童|小孩|子女|宝宝/, '儿童房'],
    [/老人|长辈/, '老人房'],
    [/次卧|卧室|客卧|房间/, '卧室'],
    [/书房|工作间|学习/, '书房'],
    [/客厅|起居/, '客厅'],
    [/餐厅|餐厨/, '餐厅'],
    [/厨房/, '厨房'],
    [/卫生间|卫浴|洗手间|主卫|客卫/, '卫生间'],
    [/阳台|露台/, '阳台'],
    [/玄关|门厅|入户/, '玄关'],
    [/衣帽间/, '衣帽间'],
    [/储藏|储物/, '储藏间'],
  ];
  return rules.find(([pattern]) => pattern.test(name))?.[1] ?? '通用房间';
}
