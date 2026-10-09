import { normalizeFurniture } from "../model/costs";
import { library } from "./catalog";
import {
  uid,
  type Design,
  type Furniture,
  type LibraryItem,
  type Opening,
  type Point,
  type Room,
  type Wall,
  type WallKind,
} from "../model/types";

/** 矩形：[x1, y1, x2, y2]，单位 mm，原点在户型内净轮廓的左上角，y 向下（下方为南）。 */
export type Box = [number, number, number, number];

/** 内墙：沿轴线给定。horizontal 时 at 为 y、from/to 为 x；vertical 时相反。 */
export interface WallSpec {
  /** 便于开口引用的名字，同一份方案内唯一。 */
  key: string;
  dir: "h" | "v";
  at: number;
  from: number;
  to: number;
  thickness?: number;
  kind?: WallKind;
}

export type Side = "up" | "down" | "left" | "right";

/** 墙上的开口：at 为洞口中心沿墙方向的世界坐标（横墙给 x，竖墙给 y）。 */
export interface OpeningSpec {
  /** 目标墙：外围墙用 top / right / bottom / left，内墙用墙的 key。 */
  wall: string;
  kind: "door" | "window";
  at: number;
  width: number;
  /** 门扇开向哪一侧；合页在坐标较小的一端（start）还是较大的一端（end）。 */
  into?: Side;
  hinge?: "start" | "end";
}

export interface RoomSpec {
  id: string;
  name: string;
  mat: string;
  /** 净空矩形，或任意多边形（L 形客餐厅等）。 */
  box?: Box;
  poly?: Point[];
  counted?: boolean;
}

/**
 * 家具简写：背靠哪面墙 + 沿墙位置 + 离墙距离。
 * 坐标相对所在分区 zone 的左上角，尺寸与颜色默认取自素材库。
 */
export interface FurnitureSpec {
  type: string;
  /** 指定素材条目（账号 / 项目家具）：由外部解析器按 catalogId 取尺寸与外观。 */
  catalogId?: string;
  /** 素材库里的名字，用于精确取尺寸与颜色；只给 type 时取该类型的第一件。 */
  name?: string;
  /** 显示名（与素材库不同时使用，例如把「橱柜台面」叫作「吊柜」）。 */
  label?: string;
  w?: number;
  d?: number;
  back: Side;
  /** 家具中心沿背后那面墙方向的位置（横墙量 x，竖墙量 y）；缺省居中。 */
  along?: number;
  /** 背面离墙的净距，缺省贴墙。 */
  gap?: number;
  color?: string;
}

export interface FurnitureZone {
  /** 摆放分区：通常就是房间净空矩形。 */
  zone: Box;
  items: FurnitureSpec[];
}

export interface PlanSpec {
  id: string;
  /** 外接矩形的长宽（室内净尺寸）。 */
  width: number;
  depth: number;
  /**
   * 不规则外轮廓（室内净轮廓的顶点，横平竖直、首尾相连）。缺省为 width × depth 的矩形，
   * 外墙名 top / right / bottom / left；给出时外墙沿它生成，第 k 条边命名为 e{k}（见 outlineEdgeKey）。
   */
  outline?: Point[];
  thickness?: number;
  height?: number;
  walls: WallSpec[];
  openings: OpeningSpec[];
  rooms: RoomSpec[];
  furniture: FurnitureZone[];
}

export const INNER_WALL = 120;
const OUTER_WALL = 240;
/** 短于该长度的墙垛没有意义，直接并入洞口旁的缺口。 */
const MIN_PIER = 60;

/** 把四边各向内收半个内墙厚：sides 里写哪条边（t/b/l/r）就收哪条边。 */
export function net(x1: number, y1: number, x2: number, y2: number, sides = ""): Box {
  const h = INNER_WALL / 2;
  return [
    x1 + (sides.includes("l") ? h : 0),
    y1 + (sides.includes("t") ? h : 0),
    x2 - (sides.includes("r") ? h : 0),
    y2 - (sides.includes("b") ? h : 0),
  ];
}

const boxPoly = ([x1, y1, x2, y2]: Box): Point[] => [
  [x1, y1],
  [x2, y1],
  [x2, y2],
  [x1, y2],
];

interface Axis {
  key: string;
  dir: "h" | "v";
  /** 垂直于走向的中心线坐标。 */
  at: number;
  from: number;
  to: number;
  thickness: number;
  kind: WallKind;
}

/** 外围四面墙：与 geometry.outerWalls 一致——墙体在室内净尺寸之外，内表面贴着 0 / width / depth。 */
function outline(width: number, depth: number, t: number): Axis[] {
  const base = { thickness: t, kind: "exterior" as WallKind };
  return [
    { ...base, key: "top", dir: "h", at: -t / 2, from: -t, to: width + t },
    { ...base, key: "right", dir: "v", at: width + t / 2, from: -t, to: depth + t },
    { ...base, key: "bottom", dir: "h", at: depth + t / 2, from: -t, to: width + t },
    { ...base, key: "left", dir: "v", at: -t / 2, from: -t, to: depth + t },
  ];
}

/** 不规则外轮廓第 i 条边（第 i 点 → 第 i+1 点）的外墙名。 */
export const outlineEdgeKey = (i: number) => `e${i + 1}`;

/**
 * 沿不规则外轮廓生成外墙：每条边向外偏移半个墙厚得到中心线，两端各伸出半个墙厚补上转角
 * （与矩形外墙同一做法；凹角处伸出的部分落在相邻外墙墙体内，不侵入室内）。
 */
function polygonOutline(ring: Point[], t: number): Axis[] {
  // 有符号面积 > 0 表示顺时针（y 向下的屏幕坐标）。
  const signed = ring.reduce((s, a, i) => {
    const b = ring[(i + 1) % ring.length];
    return s + a[0] * b[1] - b[0] * a[1];
  }, 0);
  const cw = signed > 0;
  return ring.map((a, i) => {
    const b = ring[(i + 1) % ring.length];
    const dir: "h" | "v" = a[1] === b[1] ? "h" : "v";
    // 顺时针时：向右走外侧在上（-y），向下走外侧在右（+x）；逆时针相反。
    const outward = dir === "h" ? (b[0] > a[0] ? -1 : 1) : (b[1] > a[1] ? 1 : -1);
    const sign = cw ? outward : -outward;
    const [p, q] = dir === "h" ? [a[0], b[0]] : [a[1], b[1]];
    return {
      key: outlineEdgeKey(i),
      dir,
      at: (dir === "h" ? a[1] : a[0]) + (sign * t) / 2,
      from: Math.min(p, q) - t / 2,
      to: Math.max(p, q) + t / 2,
      thickness: t,
      kind: "exterior" as WallKind,
    };
  });
}

/** 内墙两端各伸出半个墙厚，补上转角与丁字接头处的缺口；顶到外墙内表面的一端不伸。 */
function innerAxis(w: WallSpec, width: number, depth: number): Axis {
  const thickness = w.thickness ?? INNER_WALL;
  const limit = w.dir === "h" ? width : depth;
  return {
    key: w.key,
    dir: w.dir,
    at: w.at,
    from: w.from <= 0 ? 0 : w.from - thickness / 2,
    to: w.to >= limit ? limit : w.to + thickness / 2,
    thickness,
    kind: w.kind ?? "partition",
  };
}

const point = (axis: Axis, along: number): Point =>
  axis.dir === "h" ? [along, axis.at] : [axis.at, along];

/**
 * 门扇开向 → swingSide。墙的起点恒为坐标较小的一端，
 * 此时横墙 -1 朝上、+1 朝下，竖墙 -1 朝右、+1 朝左（见 model/doorOrientation.ts）。
 */
function swingSideOf(axis: Axis, into: Side): -1 | 1 {
  const ok = axis.dir === "h" ? into === "up" || into === "down" : into === "left" || into === "right";
  if (!ok) throw new Error(`墙 ${axis.key} 上的门不能朝 ${into} 开`);
  return into === "up" || into === "right" ? -1 : 1;
}

/**
 * 由「墙 + 开口」生成墙段与门窗。与参考户型同一约定：每段实墙与每个洞口各自是一段墙，
 * 洞口段的 offset = 墙长 / 2、width = 墙长，2D 平面与 3D 场景无需额外约定就能把洞口显形。
 */
export function buildStructure(spec: PlanSpec): { walls: Wall[]; openings: Opening[] } {
  const t = spec.thickness ?? OUTER_WALL;
  const axes = [
    ...(spec.outline ? polygonOutline(spec.outline, t) : outline(spec.width, spec.depth, t)),
    ...spec.walls.map((w) => innerAxis(w, spec.width, spec.depth)),
  ];
  const keys = new Set<string>();
  for (const axis of axes) {
    if (keys.has(axis.key)) throw new Error(`户型模板 ${spec.id} 里墙名重复：${axis.key}`);
    keys.add(axis.key);
  }
  for (const o of spec.openings)
    if (!keys.has(o.wall)) throw new Error(`户型模板 ${spec.id} 的开口指向了不存在的墙：${o.wall}`);
  const walls: Wall[] = [];
  const openings: Opening[] = [];
  for (const axis of axes) {
    const segment = (id: string, from: number, to: number): Wall => ({
      id,
      kind: axis.kind,
      a: point(axis, from),
      b: point(axis, to),
      thickness: axis.thickness,
    });
    const cuts = spec.openings
      .filter((o) => o.wall === axis.key)
      .sort((a, b) => a.at - b.at);
    let cursor = axis.from;
    cuts.forEach((cut, i) => {
      const start = cut.at - cut.width / 2;
      const end = cut.at + cut.width / 2;
      if (start < cursor || end > axis.to)
        throw new Error(`户型模板 ${spec.id}：墙 ${axis.key} 上的开口越界或互相重叠`);
      if (start - cursor >= MIN_PIER) walls.push(segment(`${axis.key}-${i}`, cursor, start));
      const id = `${cut.kind}-${axis.key}-${i}`;
      walls.push(segment('opening-wall-' + id, start, end));
      openings.push({
        id,
        wallId: 'opening-wall-' + id,
        kind: cut.kind,
        offset: cut.width / 2,
        width: cut.width,
        open: true,
        ...(cut.kind === "door" && cut.into
          ? { hinge: cut.hinge ?? "start", swingSide: swingSideOf(axis, cut.into) }
          : {}),
      });
      cursor = end;
    });
    if (axis.to - cursor >= MIN_PIER)
      walls.push(segment(cuts.length ? `${axis.key}-end` : axis.key, cursor, axis.to));
  }
  return { walls, openings };
}

/** 家具简写 → 素材条目。默认查内置素材库；AI 方案会传入包含账号 / 项目家具的解析器。 */
export type CatalogResolver = (spec: FurnitureSpec) => LibraryItem | undefined;

export const libraryResolver: CatalogResolver = ({ type, name }) =>
  (name ? library.find((i) => i.type === type && i.name === name) : undefined) ??
  library.find((i) => i.type === type);

/** 背靠方向 → 旋转角，与参考户型一致：0 靠上、90 靠右、180 靠下、270 靠左。 */
const ROT: Record<Side, number> = { up: 0, right: 90, down: 180, left: 270 };

/** 把家具简写解析成实际坐标。 */
export function placeFurniture({ zone, items }: FurnitureZone, resolve: CatalogResolver = libraryResolver): Furniture[] {
  const [x1, y1, x2, y2] = zone;
  return items.map((s) => {
    const item = resolve(s);
    if (!item) throw new Error(`素材库里没有 ${s.type}${s.name ? " / " + s.name : ""}`);
    const w = s.w ?? item.w;
    const d = s.d ?? item.d;
    const gap = s.gap ?? 0;
    const horizontal = s.back === "up" || s.back === "down";
    const along = s.along ?? (horizontal ? x2 - x1 : y2 - y1) / 2;
    const cx = horizontal
      ? x1 + along
      : s.back === "left"
        ? x1 + gap + d / 2
        : x2 - gap - d / 2;
    const cy = !horizontal
      ? y1 + along
      : s.back === "up"
        ? y1 + gap + d / 2
        : y2 - gap - d / 2;
    return normalizeFurniture({
      id: uid(),
      type: item.type,
      name: s.label ?? item.name,
      cx,
      cy,
      w,
      d,
      rot: ROT[s.back],
      color: s.color || item.color,
      ...(s.catalogId && item.catalogId
        ? {
            catalogId: item.catalogId,
            ...(item.shape ? { shape: item.shape } : {}),
            ...(item.height ? { height: item.height } : {}),
            ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
          }
        : {}),
    });
  });
}

/** 由一份户型描述装配出完整方案。 */
export function buildPlan(spec: PlanSpec, resolve: CatalogResolver = libraryResolver): Design {
  const { walls, openings } = buildStructure(spec);
  const rooms: Room[] = spec.rooms.map((r) => {
    const ring = r.poly ?? (r.box ? boxPoly(r.box) : null);
    if (!ring) throw new Error(`户型模板 ${spec.id} 的房间 ${r.id} 缺少轮廓`);
    return {
      id: r.id,
      name: r.name,
      rings: [ring],
      mat: r.mat,
      ...(r.counted === undefined ? {} : { counted: r.counted }),
    };
  });
  return {
    version: 2,
    template: "reference",
    templateId: spec.id,
    width: spec.width,
    depth: spec.depth,
    thickness: spec.thickness ?? OUTER_WALL,
    height: spec.height ?? 2800,
    walls,
    openings,
    rooms,
    furniture: spec.furniture.flatMap((zone) => placeFurniture(zone, resolve)),
    demolished: [],
  };
}
