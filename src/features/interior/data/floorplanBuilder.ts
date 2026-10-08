import { normalizeFurniture } from "../model/costs";
import { library } from "./catalog";
import {
  uid,
  type Design,
  type Furniture,
  type Opening,
  type Point,
  type Room,
  type Wall,
  type WallKind,
} from "../model/types";

/** 外围墙 / 隔墙：按矩形给定，厚边即墙厚，中轴取矩形的中心线（与参考户型同一套约定）。 */
export interface FloorplanWall {
  rect: [number, number, number, number];
  kind?: WallKind;
}

/** 墙上的开口：offset 为沿墙起点量起的洞口中心距离，可留出墙垛。 */
export interface FloorplanOpening {
  wall: number;
  offset: number;
  width: number;
  kind: "door" | "window";
  hinge?: "start" | "end";
  swingSide?: -1 | 1;
}

export interface FloorplanRoom {
  id: string;
  name: string;
  rect: [number, number, number, number];
  mat: string;
  counted?: boolean;
}

export interface FloorplanSpec {
  width: number;
  depth: number;
  thickness: number;
  height?: number;
  /** 外围墙自动生成（前 4 段），这里只写内部隔墙与承重段；openings.wall 的索引按拼接后的顺序。 */
  walls: FloorplanWall[];
  openings: FloorplanOpening[];
  rooms: FloorplanRoom[];
}

export interface BuiltFloorplan {
  walls: Wall[];
  openings: Opening[];
  rooms: Room[];
}

/** 外围四面墙：与 geometry.outerWalls 同一结果，只是带上显式索引以便挂开口。 */
const outline = (width: number, depth: number, t: number): FloorplanWall[] => {
  const h = t / 2;
  return [
    { rect: [-h, -h, width + h, h] },
    { rect: [width - h, -h, width + h, depth + h] },
    { rect: [-h, depth - h, width + h, depth + h] },
    { rect: [-h, -h, h, depth + h] },
  ];
};

/** 矩形 → 墙：长边为走向，短边为厚度。 */
export function wallFromRect(
  id: string,
  rect: [number, number, number, number],
  kind: WallKind,
): Wall {
  const [x, y, x2, y2] = rect;
  const horizontal = x2 - x >= y2 - y;
  return {
    id,
    kind,
    a: horizontal ? [x, (y + y2) / 2] : [(x + x2) / 2, y],
    b: horizontal ? [x2, (y + y2) / 2] : [(x + x2) / 2, y2],
    thickness: horizontal ? y2 - y : x2 - x,
  };
}

const rectOf = (x: number, y: number, w: number, h: number): Point[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];

/**
 * 由「墙 + 墙上的开口 + 房间矩形」装配一份可用的 Design。
 * 与参考户型一致：开口直接落在完整墙段上（offset 沿墙计），2D 平面与 3D 场景
 * 都会把该段墙显形为洞口，因此不需要手工把墙一段段拆开。
 */
export function buildFloorplan(spec: FloorplanSpec): BuiltFloorplan {
  const all = [...outline(spec.width, spec.depth, spec.thickness), ...spec.walls];
  const walls: Wall[] = all.map((item, index) =>
    wallFromRect("w" + index, item.rect, item.kind ?? (index < 4 ? "exterior" : "partition")),
  );
  const openings: Opening[] = spec.openings.map((o, i) => {
    const wall = walls[o.wall];
    const id = (o.kind === "door" ? "door-" : "win-") + i;
    return {
      id,
      wallId: wall.id,
      kind: o.kind,
      offset: o.offset,
      width: o.width,
      open: true,
      ...(o.hinge ? { hinge: o.hinge } : {}),
      ...(o.swingSide ? { swingSide: o.swingSide } : {}),
    };
  });
  const rooms: Room[] = spec.rooms.map((r) => ({
    id: r.id,
    name: r.name,
    rings: [rectOf(r.rect[0], r.rect[1], r.rect[2], r.rect[3])],
    mat: r.mat,
    ...(r.counted === undefined ? {} : { counted: r.counted }),
  }));
  return { walls, openings, rooms };
}

/**
 * 家具简写：以「贴哪面墙 + 沿墙位置」描述，避免手抄中心点坐标。
 * wall 指明靠背方向（家具的「背面」贴在该侧的墙上），along 为沿墙方向的中心距离。
 */
export interface FurnitureSpec {
  type: string;
  /** 库里的中文名，同时用于取默认颜色。 */
  name: string;
  w?: number;
  d?: number;
  /** back-bottom：背靠下墙（+y），back-top：靠上墙，back-right：靠右墙，back-left：靠左墙。 */
  wall: "back-left" | "back-right" | "back-top" | "back-bottom" | "center";
  /** 沿墙方向的距离（从该墙起点量起）；缺省居中。 */
  along?: number;
  /** 离背后那面墙的净距，缺省贴墙。 */
  gap?: number;
  color?: string;
}

/** 默认尺寸与颜色都取自素材库，保证与「点击添加」出来的家具完全一致。 */
const catalogOf = (type: string, name?: string) =>
  library.find((i) => i.type === type && (!name || i.name === name)) ??
  library.find((i) => i.type === type);

const ROT_OF_WALL = { "back-top": 0, "back-right": 90, "back-bottom": 180, "back-left": 270 } as const;

/** 按「贴墙 + 沿墙位置」解析出家具。 */
export function placeFurniture(
  room: [number, number, number, number],
  specs: FurnitureSpec[],
): Furniture[] {
  const [x, y, w, h] = room;
  return specs.map((s) => {
    const item = catalogOf(s.type, s.name);
    if (!item) throw new Error(`素材库里没有 ${s.type} / ${s.name}`);
    const fw = s.w ?? item.w,
      fd = s.d ?? item.d,
      gap = s.gap ?? 0;
    // 旋转后沿墙方向占用的长度：0/180 用 fw，90/270 用 fd。
    const rot = s.wall === "center" ? 0 : ROT_OF_WALL[s.wall],
      alongSpan = rot % 180 === 0 ? fw : fd,
      depthSpan = rot % 180 === 0 ? fd : fw;
    let cx = x + w / 2,
      cy = y + h / 2;
    if (s.wall === "back-top") cy = y + gap + depthSpan / 2;
    else if (s.wall === "back-bottom") cy = y + h - gap - depthSpan / 2;
    else if (s.wall === "back-left") cx = x + gap + depthSpan / 2;
    else if (s.wall === "back-right") cx = x + w - gap - depthSpan / 2;
    if (s.along !== undefined) {
      if (rot % 180 === 0) cx = x + s.along;
      else cy = y + s.along;
    }
    return normalizeFurniture({
      id: uid(),
      type: item.type,
      name: item.name,
      cx,
      cy,
      w: fw,
      d: fd,
      rot,
      color: s.color || item.color,
    });
  });
}

/** 房间矩形的中心，便于「居中放置」。 */
export const roomCenter = (r: [number, number, number, number]): Point => [r[0] + r[2] / 2, r[1] + r[3] / 2];
