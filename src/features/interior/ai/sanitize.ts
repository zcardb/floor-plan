import { INNER_WALL, libraryResolver } from "../data/floorplanBuilder";
import type { Box, CatalogResolver, FurnitureSpec, FurnitureZone, OpeningSpec, PlanSpec, RoomSpec, Side, WallSpec } from "../data/floorplanBuilder";
import { materials } from "../data/catalog";
import { inRing, ringArea } from "../model/geometry";
import type { LibraryItem, Point } from "../model/types";
import type { AiCatalog, AiRequiredItem } from "./types";

const MAX_ROOM_ITEMS = 40;
const MAX_PLAN_ITEMS = 100;
/** 短于该长度的内墙是碎墙垛，丢弃。 */
const MIN_WALL_LENGTH = 600;
/** 小于该面积（m²）的房间没有意义，丢弃。 */
const MIN_ROOM_AREA = 1.5;
/** 内墙离外墙内侧至少这么远，否则会和外墙叠在一起。 */
const MIN_WALL_OFFSET = 300;
const SIDES: Side[] = ["up", "down", "left", "right"];
const OUTER_NAMES = ["top", "right", "bottom", "left"];
const MAT_FALLBACK = "wood";

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const text = (v: unknown, max = 40) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
const round10 = (n: number) => Math.round(n / 10) * 10;
const clamp = (v: number, min: number, max: number) => Math.min(Math.max(min, v), Math.max(min, max));
const isSide = (v: unknown): v is Side => typeof v === "string" && (SIDES as string[]).includes(v);

const boundsOf = (ring: Point[]): Box => [
  Math.min(...ring.map((p) => p[0])),
  Math.min(...ring.map((p) => p[1])),
  Math.max(...ring.map((p) => p[0])),
  Math.max(...ring.map((p) => p[1])),
];

/** 素材解析器：先按 catalogId 在本次目录 / 项目目录里找，再退回内置素材库。 */
export const catalogResolver = (catalog: AiCatalog, project: LibraryItem[] = []): CatalogResolver => (spec) =>
  (spec.catalogId ? catalog.byId.get(spec.catalogId) ?? project.find((item) => item.catalogId === spec.catalogId) : undefined) ??
  libraryResolver(spec);

interface RawPlaced {
  code?: unknown;
  back?: unknown;
  along?: unknown;
  gap?: unknown;
}

/**
 * 模型给的家具条目 → 家具简写。代号在目录里查不到、背靠方向非法、放不进分区的都返回 null。
 * 沿墙位置与离墙距离会夹进分区，保证家具整体落在房间净空内。
 */
function toSpec(raw: RawPlaced, zone: Box, catalog: AiCatalog, ring?: Point[]): FurnitureSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const item = catalog.byCode.get(text(raw.code, 20) ?? "");
  if (!item?.catalogId || !isSide(raw.back)) return null;
  const [x1, y1, x2, y2] = zone;
  const horizontal = raw.back === "up" || raw.back === "down";
  const alongSpan = horizontal ? x2 - x1 : y2 - y1;
  const depthSpan = horizontal ? y2 - y1 : x2 - x1;
  if (item.w > alongSpan || item.d > depthSpan) return null;
  const along = round10(clamp(num(raw.along) ?? alongSpan / 2, item.w / 2, alongSpan - item.w / 2));
  const gap = round10(clamp(num(raw.gap) ?? 0, 0, depthSpan - item.d));
  if (ring) {
    const offset = gap + item.d / 2;
    const center: Point = horizontal
      ? [x1 + along, raw.back === "up" ? y1 + offset : y2 - offset]
      : [raw.back === "left" ? x1 + offset : x2 - offset, y1 + along];
    if (!inRing(center, ring)) return null;
  }
  return { type: item.type, name: item.name, catalogId: item.catalogId, back: raw.back, along, gap };
}

/** 地毯先画，避免盖住其他家具。 */
const rugsFirst = (specs: FurnitureSpec[]) => [...specs].sort((a, b) => Number(b.type === "rug") - Number(a.type === "rug"));

/**
 * 房间布局候选 → 家具简写。
 * required 非空时，方案里的家具必须与指定清单完全一致（种类与件数都一致），否则抛错丢弃该候选；
 * required 为空表示由 AI 从完整目录里自由搭配。一件都放不下同样抛错。
 */
export function sanitizeRoomItems(
  value: unknown,
  { zone, ring, catalog, required = [] }: { zone: Box; ring?: Point[]; catalog: AiCatalog; required?: AiRequiredItem[] },
): FurnitureSpec[] {
  const raw = Array.isArray(value) ? value : (value as { items?: unknown } | null)?.items;
  if (!Array.isArray(raw)) throw new Error("方案里没有家具清单");
  const specs = raw
    .slice(0, MAX_ROOM_ITEMS)
    .map((entry) => toSpec(entry as RawPlaced, zone, catalog, ring))
    .filter((spec): spec is FurnitureSpec => !!spec);
  if (!specs.length) throw new Error("方案里的家具放不进这个房间");
  if (required.length) {
    const placed = new Map<string, number>();
    for (const spec of specs) {
      const code = catalog.codeOf(spec.catalogId!)!;
      placed.set(code, (placed.get(code) ?? 0) + 1);
    }
    const wanted = new Map<string, number>();
    for (const need of required) wanted.set(need.code, (wanted.get(need.code) ?? 0) + need.count);
    const same = placed.size === wanted.size && [...wanted].every(([code, count]) => placed.get(code) === count);
    if (!same) throw new Error("方案里的家具与指定清单不一致");
  }
  return rugsFirst(specs);
}

/** 房间轮廓的某条边上是否有内墙（重合超过一半才算）。 */
function wallOnEdge(a: Point, b: Point, walls: WallSpec[]) {
  const horizontal = a[1] === b[1];
  const at = horizontal ? a[1] : a[0];
  const [from, to] = horizontal ? [Math.min(a[0], b[0]), Math.max(a[0], b[0])] : [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
  return walls.some(
    (w) =>
      w.dir === (horizontal ? "h" : "v") &&
      Math.abs(w.at - at) <= 30 &&
      Math.min(to, w.to) - Math.max(from, w.from) > (to - from) / 2,
  );
}

/**
 * 模型按墙中心线给房间轮廓；这里把贴着内墙的边向房间内收半个墙厚，得到净空轮廓。
 * 只处理横平竖直的轮廓；斜边轮廓原样返回。
 */
function netRing(source: Point[], walls: WallSpec[]): Point[] {
  // 先去掉共线的中间点，保证相邻两条边一横一竖。
  const ring = source.filter((p, i) => {
    const prev = source[(i - 1 + source.length) % source.length], next = source[(i + 1) % source.length];
    return !((prev[0] === p[0] && p[0] === next[0]) || (prev[1] === p[1] && p[1] === next[1]));
  });
  if (ring.length < 4) return source;
  const half = INNER_WALL / 2;
  const edges = ring.map((a, i) => {
    const b = ring[(i + 1) % ring.length];
    const horizontal = a[1] === b[1];
    if (!horizontal && a[0] !== b[0]) return null;
    const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const inward = horizontal
      ? (inRing([mid[0], mid[1] + 1], ring) ? 1 : -1)
      : (inRing([mid[0] + 1, mid[1]], ring) ? 1 : -1);
    const at = (horizontal ? a[1] : a[0]) + (wallOnEdge(a, b, walls) ? inward * half : 0);
    return { horizontal, at };
  });
  if (edges.some((edge) => !edge)) return source;
  return ring.map((_, i) => {
    const before = edges[(i - 1 + ring.length) % ring.length]!, after = edges[i]!;
    return before.horizontal === after.horizontal
      ? ring[i]
      : before.horizontal ? [after.at, before.at] : [before.at, after.at];
  });
}

/**
 * 整户户型候选 → PlanSpec：只取内墙、门窗、房间与家具，外墙由渲染器按长宽生成。
 * - 墙 key 与房间 id 全部重新命名（w- / r-），避免与外墙名或彼此撞 id 导致方案加载失败；
 *   门窗与家具通过「原名 → 新名」映射重新对上。
 * - 越界 / 重叠的门窗、碎墙、过小的房间、目录外的家具都丢弃；房间或家具全部不可用时抛错。
 */
export function sanitizePlan(value: unknown, { width: fixedWidth, depth: fixedDepth, catalog }: { width?: number; depth?: number; catalog: AiCatalog }): PlanSpec {
  const raw = (value ?? {}) as { width?: unknown; depth?: unknown; walls?: unknown; openings?: unknown; rooms?: unknown; furniture?: unknown };
  // 高级设计没填的长宽由 AI 决定：取模型输出的尺寸，夹进合理范围。
  const sizeOf = (fixed: number | undefined, given: unknown) => {
    if (fixed !== undefined) return fixed;
    const n = num(given);
    if (n === undefined) throw new Error("方案缺少户型尺寸");
    return round10(clamp(n, 3000, 40000));
  };
  const width = sizeOf(fixedWidth, raw.width), depth = sizeOf(fixedDepth, raw.depth);
  const list = (v: unknown) => (Array.isArray(v) ? v : []);

  const walls: WallSpec[] = [];
  const wallKeys = new Map<string, string>();
  for (const entry of list(raw.walls)) {
    const w = (entry ?? {}) as { key?: unknown; dir?: unknown; at?: unknown; from?: unknown; to?: unknown };
    const key = text(w.key), at = num(w.at);
    // 外墙名 top/right/bottom/left 是保留字：模型把它们当内墙 key 用会造成歧义，直接丢弃。
    if (!key || OUTER_NAMES.includes(key) || wallKeys.has(key) || (w.dir !== "h" && w.dir !== "v") || at === undefined) continue;
    const across = w.dir === "h" ? depth : width, limit = w.dir === "h" ? width : depth;
    if (at < MIN_WALL_OFFSET || at > across - MIN_WALL_OFFSET) continue;
    const ends = [clamp(num(w.from) ?? 0, 0, limit), clamp(num(w.to) ?? limit, 0, limit)].sort((a, b) => a - b);
    if (ends[1] - ends[0] < MIN_WALL_LENGTH) continue;
    const next = `w-${walls.length + 1}`;
    wallKeys.set(key, next);
    walls.push({ key: next, dir: w.dir, at: round10(at), from: round10(ends[0]), to: round10(ends[1]) });
  }

  const spanOf = (key: string): [string, number, number] | undefined => {
    if (key === "top" || key === "bottom") return [key, 0, width];
    if (key === "left" || key === "right") return [key, 0, depth];
    const wall = walls.find((w) => w.key === wallKeys.get(key));
    return wall && [wall.key, wall.from, wall.to];
  };
  const openings: OpeningSpec[] = [];
  const cuts = new Map<string, [number, number][]>();
  for (const entry of list(raw.openings)) {
    const o = (entry ?? {}) as { wall?: unknown; kind?: unknown; at?: unknown; width?: unknown; into?: unknown; hinge?: unknown };
    const span = spanOf(text(o.wall) ?? ""), at = num(o.at);
    if (!span || (o.kind !== "door" && o.kind !== "window") || at === undefined) continue;
    const [wall, from, to] = span;
    const size = round10(clamp(num(o.width) ?? (o.kind === "door" ? 900 : 1500), 600, o.kind === "door" ? 2400 : 3600));
    // 洞口两侧各留 100mm 墙垛。
    if (to - from < size + 200) continue;
    const center = round10(clamp(at, from + size / 2 + 100, to - size / 2 - 100));
    const used = cuts.get(wall) ?? [];
    if (used.some(([a, b]) => center - size / 2 < b + 100 && center + size / 2 > a - 100)) continue;
    cuts.set(wall, [...used, [center - size / 2, center + size / 2]]);
    const horizontal = wall === "top" || wall === "bottom" || walls.find((w) => w.key === wall)?.dir === "h";
    const into = isSide(o.into) && (horizontal ? o.into === "up" || o.into === "down" : o.into === "left" || o.into === "right") ? o.into : undefined;
    openings.push({
      wall,
      kind: o.kind,
      at: center,
      width: size,
      ...(o.kind === "door" && into ? { into, hinge: o.hinge === "end" ? "end" as const : "start" as const } : {}),
    });
  }

  const rooms: RoomSpec[] = [];
  const zones = new Map<string, { zone: Box; ring: Point[] }>();
  for (const entry of list(raw.rooms)) {
    const r = (entry ?? {}) as { id?: unknown; name?: unknown; mat?: unknown; box?: unknown; poly?: unknown };
    const box = Array.isArray(r.box) && r.box.length === 4 && r.box.every((n) => num(n) !== undefined) ? (r.box as number[]) : null;
    const source: Point[] | null = box
      ? [[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]]]
      : Array.isArray(r.poly) && r.poly.every((p) => Array.isArray(p) && p.length === 2 && p.every((n) => num(n) !== undefined))
        ? (r.poly as Point[])
        : null;
    if (!source || source.length < 3) continue;
    const ring = netRing(source.map(([x, y]): Point => [round10(clamp(x, 0, width)), round10(clamp(y, 0, depth))]), walls);
    if (ringArea(ring) / 1e6 < MIN_ROOM_AREA) continue;
    const name = text(r.name, 20) ?? `房间 ${rooms.length + 1}`;
    const mat = text(r.mat);
    rooms.push({ id: `r-${rooms.length + 1}`, name, mat: mat && mat in materials ? mat : MAT_FALLBACK, poly: ring });
    const target = { zone: boundsOf(ring), ring };
    // 模型的家具分区既可能引用房间 id，也可能引用房间名，两个都登记。
    for (const ref of [text(r.id), name]) if (ref && !zones.has(ref)) zones.set(ref, target);
  }
  if (!rooms.length) throw new Error("方案里没有可用的房间");

  const furniture: FurnitureZone[] = [];
  let budget = MAX_PLAN_ITEMS;
  for (const entry of list(raw.furniture)) {
    const g = (entry ?? {}) as { room?: unknown; items?: unknown };
    const target = zones.get(text(g.room) ?? "");
    if (!target || budget <= 0) continue;
    const items = list(g.items)
      .slice(0, Math.min(MAX_ROOM_ITEMS, budget))
      .map((item) => toSpec(item as RawPlaced, target.zone, catalog, target.ring))
      .filter((spec): spec is FurnitureSpec => !!spec);
    if (!items.length) continue;
    budget -= items.length;
    furniture.push({ zone: target.zone, items: rugsFirst(items) });
  }

  return { id: "ai", width: Math.round(width), depth: Math.round(depth), walls, openings, rooms, furniture };
}
