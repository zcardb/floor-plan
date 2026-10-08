import { normalizeFurniture } from "../model/costs";
import { length } from "../model/geometry";
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

/** 墙：按矩形给定，长边即走向、短边即墙厚（外围墙与参考户型同一套约定）。 */
export interface FloorplanWall {
  /** 便于开口引用的名字，同一份方案内唯一。 */
  key: string;
  rect: [number, number, number, number];
  kind?: WallKind;
}

/** 墙上的开口：offset 为沿墙起点量起的洞口中心距离，可留出墙垛。 */
export interface FloorplanOpening {
  /** 目标墙：外围墙用 top / right / bottom / left，内墙用墙的 key。 */
  wall: string;
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
  /** 内部隔墙与承重段；外围四面墙自动生成，索引 0–3 依次为上、右、下、左。 */
  walls: FloorplanWall[];
  openings: FloorplanOpening[];
  rooms: FloorplanRoom[];
}

export interface BuiltFloorplan {
  walls: Wall[];
  openings: Opening[];
  rooms: Room[];
}

/** 外围四面墙：与 geometry.outerWalls 一致——墙体落在室内净尺寸之外，内表面贴着 0 / width / depth。 */
const outline = (width: number, depth: number, t: number): FloorplanWall[] => [
  { key: "top", rect: [-t, -t, width + t, 0] },
  { key: "right", rect: [width, -t, width + t, depth + t] },
  { key: "bottom", rect: [-t, depth, width + t, depth + t] },
  { key: "left", rect: [-t, -t, 0, depth + t] },
];

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

/** 短于 60mm 的墙垛没有意义（校验也会拒绝），直接并进相邻墙段。 */
const MIN_PIER = 60;

/**
 * 由「墙 + 墙上的开口 + 房间矩形」装配一份可用的 Design。
 * 与参考户型一致：每段实墙与每个洞口各自是一段墙，洞口段的 offset = 墙长 / 2、width = 墙长，
 * 因此 2D 平面与 3D 场景无需额外约定即可把洞口正确显形。
 */
export function buildFloorplan(spec: FloorplanSpec): BuiltFloorplan {
  const all = [...outline(spec.width, spec.depth, spec.thickness), ...spec.walls];
  const walls: Wall[] = [];
  const openings: Opening[] = [];
  const keys = new Set<string>();
  all.forEach((item, index) => {
    if (keys.has(item.key)) throw new Error(`户型模板里墙名重复：${item.key}`);
    keys.add(item.key);
  });
  all.forEach((item, index) => {
    const base = wallFromRect(
      "w" + index,
      item.rect,
      item.kind ?? (index < 4 ? "exterior" : "partition"),
    );
    const cuts = spec.openings
      .filter((o) => o.wall === item.key)
      .sort((a, b) => a.offset - b.offset);
    if (!cuts.length) {
      walls.push(base);
      return;
    }
    const total = length(base);
    const at = (distance: number): Point => {
      const k = distance / total;
      return [
        base.a[0] + (base.b[0] - base.a[0]) * k,
        base.a[1] + (base.b[1] - base.a[1]) * k,
      ];
    };
    let cursor = 0;
    cuts.forEach((cut, i) => {
      const start = cut.offset - cut.width / 2;
      const end = cut.offset + cut.width / 2;
      if (start - cursor >= MIN_PIER)
        walls.push({ ...base, id: `${base.id}-s${i}`, a: at(cursor), b: at(start) });
      const id = `${cut.kind === "door" ? "door" : "win"}-${item.key}-${i}`;
      walls.push({ ...base, id, a: at(start), b: at(end) });
      openings.push({
        id,
        wallId: id,
        kind: cut.kind,
        offset: cut.width / 2,
        width: cut.width,
        open: true,
        ...(cut.hinge ? { hinge: cut.hinge } : {}),
        ...(cut.swingSide ? { swingSide: cut.swingSide } : {}),
      });
      cursor = end;
    });
    if (total - cursor >= MIN_PIER)
      walls.push({ ...base, id: `${base.id}-e`, a: at(cursor), b: at(total) });
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
 * 家具简写：默认按「贴哪面墙 + 沿墙位置」描述，需要自由摆放时用 at 直接给中心点。
 * wall 指明靠背方向；rot 直接给角度时优先级最高。
 */
export interface FurnitureSpec {
  type: string;
  /** 库里的中文名，用于精确取尺寸与颜色；只给 type 时取该类目第一件。 */
  name?: string;
  w?: number;
  d?: number;
  wall?: "back-left" | "back-right" | "back-top" | "back-bottom" | "center";
  /** 沿墙方向的中心距离（从该墙起点量起）；缺省居中。 */
  along?: number;
  /** 离背后那面墙的净距，缺省贴墙。 */
  gap?: number;
  /** 自由摆放时的中心点（房间坐标）。 */
  at?: [number, number];
  rot?: number;
  color?: string;
}

/** 尺寸与颜色默认取自素材库，保证与「点击添加」出来的家具完全一致。 */
const catalogOf = (type: string, name?: string) =>
  (name ? library.find((i) => i.type === type && i.name === name) : undefined) ??
  library.find((i) => i.type === type);

const ROT_OF_WALL = {
  "back-top": 0,
  "back-right": 90,
  "back-bottom": 180,
  "back-left": 270,
  center: 0,
} as const;

/** 把家具简写解析成实际坐标。 */
export function placeFurniture(
  room: [number, number, number, number],
  specs: FurnitureSpec[],
): Furniture[] {
  const [x, y, w, h] = room;
  return specs.map((s) => {
    const item = catalogOf(s.type, s.name);
    if (!item) throw new Error(`素材库里没有 ${s.type}${s.name ? " / " + s.name : ""}`);
    const fw = s.w ?? item.w;
    const fd = s.d ?? item.d;
    const wall = s.wall ?? "center";
    const rot = s.rot ?? ROT_OF_WALL[wall];
    const alongSpan = rot % 180 === 0 ? fw : fd;
    const depthSpan = rot % 180 === 0 ? fd : fw;
    const gap = s.gap ?? 0;
    let cx: number;
    let cy: number;
    if (s.at) {
      [cx, cy] = s.at;
    } else {
      cx = x + w / 2;
      cy = y + h / 2;
      if (wall === "back-top") cy = y + gap + depthSpan / 2;
      else if (wall === "back-bottom") cy = y + h - gap - depthSpan / 2;
      else if (wall === "back-left") cx = x + gap + depthSpan / 2;
      else if (wall === "back-right") cx = x + w - gap - depthSpan / 2;
      if (s.along !== undefined) {
        if (rot % 180 === 0) cx = x + s.along;
        else cy = y + s.along;
      }
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

/** 房间矩形的中心，便于在房间内居中摆放。 */
export const roomCenter = (r: [number, number, number, number]): Point => [
  r[0] + r[2] / 2,
  r[1] + r[3] / 2,
];

/** 由构件装配成完整方案。 */
export function assemblePlan(
  meta: { id: string; width: number; depth: number; thickness: number; height?: number },
  spec: FloorplanSpec,
  furniture: Furniture[],
): Design {
  const built = buildFloorplan(spec);
  return {
    version: 2,
    template: "reference",
    templateId: meta.id,
    width: meta.width,
    depth: meta.depth,
    thickness: meta.thickness,
    height: meta.height ?? 2800,
    walls: built.walls,
    openings: built.openings,
    rooms: built.rooms,
    furniture,
    demolished: [],
  };
}
