import { type Box, type CatalogResolver, type FurnitureSpec, type FurnitureZone, INNER_WALL, libraryResolver, type OpeningSpec, outlineEdgeKey, type PlanSpec, type RoomSpec, type Side, type WallSpec } from "./floorplan-builder";
import { materials } from "@/lib/floor-plan/catalog";
import { inRing, ringArea } from "@/lib/floor-plan/geometry";
import type { LibraryItem, Point } from "@/lib/floor-plan/types";
import type { AiCatalog, AiRequiredItem } from "../types";

const MAX_ROOM_ITEMS = 40;
const MAX_PLAN_ITEMS = 100;
/** 短于该长度的内墙是碎墙垛，丢弃。 */
const MIN_WALL_LENGTH = 600;
/** 小于该面积（m²）的房间没有意义，丢弃。 */
const MIN_ROOM_AREA = 1.5;
/** 内墙离外墙内侧至少这么远，否则会和外墙叠在一起。 */
const MIN_WALL_OFFSET = 300;
/**
 * 房间边、内墙端点离外轮廓不超过该距离时吸附到外轮廓上。外墙在外轮廓之外，
 * 模型却常把外墙厚度算进室内（房间从 120 / 240 起），留下一圈露底的白边。须小于 MIN_WALL_OFFSET。
 */
const OUTER_SNAP = 250;
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
 * `clearance` 是把模型的 gap 换算到净空的偏移：plan 模式下模型按房间「中心线矩形」量，
 * 贴墙时它会为半个墙厚留 60 mm；这里按净空矩形（房间轮廓已向内收半个内墙厚）摆放，
 * 所以要扣掉这半个墙厚 —— 贴墙的 60 变成 0，模型按契约给的 0 也仍是 0，想留的真实缝隙（150 → 90）保留。
 */
function toSpec(raw: RawPlaced, zone: Box, catalog: AiCatalog, clearance = 0): FurnitureSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const item = catalog.byCode.get(text(raw.code, 20) ?? "");
  if (!item?.catalogId || !isSide(raw.back)) return null;
  const [x1, y1, x2, y2] = zone;
  const horizontal = raw.back === "up" || raw.back === "down";
  // 不因「尺寸超过这一边」或「落点不在轮廓内」丢件：丢件会让指定清单的件数对不上，
  // 直接夹到分区中心即可，用户还能手动调整。
  const along = round10(clamp(num(raw.along) ?? (horizontal ? x2 - x1 : y2 - y1) / 2, 0, Math.max(0, horizontal ? x2 - x1 : y2 - y1)));
  const gap = round10(clamp((num(raw.gap) ?? 0) - clearance, 0, Math.max(0, horizontal ? y2 - y1 : x2 - x1)));
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
  { zone, catalog, required = [] }: { zone: Box; catalog: AiCatalog; required?: AiRequiredItem[] },
): FurnitureSpec[] {
  const raw = Array.isArray(value) ? value : (value as { items?: unknown } | null)?.items;
  if (!Array.isArray(raw)) throw new Error("方案里没有家具清单");
  const specs = raw
    .slice(0, MAX_ROOM_ITEMS)
    .map((entry) => toSpec(entry as RawPlaced, zone, catalog))
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

/** 外轮廓的一条边：dir=h 为横边（at 是 y，from/to 是 x 范围），dir=v 为竖边。 */
interface OuterEdge {
  dir: "h" | "v";
  at: number;
  from: number;
  to: number;
}

const outerEdgesOf = (outline: Point[] | undefined, width: number, depth: number): OuterEdge[] =>
  outline
    ? outline.map((a, i) => {
        const b = outline[(i + 1) % outline.length];
        const dir = a[1] === b[1] ? "h" : "v";
        const [p, q] = dir === "h" ? [a[0], b[0]] : [a[1], b[1]];
        return { dir, at: dir === "h" ? a[1] : a[0], from: Math.min(p, q), to: Math.max(p, q) };
      })
    : [
        { dir: "h", at: 0, from: 0, to: width },
        { dir: "h", at: depth, from: 0, to: width },
        { dir: "v", at: 0, from: 0, to: depth },
        { dir: "v", at: width, from: 0, to: depth },
      ];

/** 与 [from, to] 重合超过一半、且离 at 不超过 OUTER_SNAP 的同向外轮廓边坐标；没有时原样返回。 */
function snapToOuter(dir: "h" | "v", at: number, from: number, to: number, outer: OuterEdge[]) {
  const hit = outer.find(
    (e) => e.dir === dir && Math.abs(e.at - at) <= OUTER_SNAP && Math.min(to, e.to) - Math.max(from, e.from) > (to - from) / 2,
  );
  return hit ? hit.at : at;
}

/** 内墙端点吸附到它顶着的那条外轮廓边上（该边须横跨内墙所在的中心线）。 */
function snapWallEnd(dir: "h" | "v", at: number, end: number, outer: OuterEdge[]) {
  const across = dir === "h" ? "v" : "h";
  const hit = outer.find((e) => e.dir === across && e.from <= at && at <= e.to && Math.abs(e.at - end) <= OUTER_SNAP);
  return hit ? hit.at : end;
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
 * 模型按墙中心线给房间轮廓；这里把贴着内墙的边向房间内收半个墙厚，
 * 贴着外墙的边吸附到外轮廓（外墙内表面），得到净空轮廓。
 * 只处理横平竖直的轮廓；斜边轮廓原样返回。
 */
function netRing(source: Point[], walls: WallSpec[], outer: OuterEdge[]): Point[] {
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
    const raw = horizontal ? a[1] : a[0];
    const [from, to] = horizontal ? [Math.min(a[0], b[0]), Math.max(a[0], b[0])] : [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
    const at = wallOnEdge(a, b, walls) ? raw + inward * half : snapToOuter(horizontal ? "h" : "v", raw, from, to, outer);
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
 * 模型给的不规则外轮廓 → 室内净轮廓顶点。必须至少 4 个点、每条边横平竖直且不短于 MIN_WALL_LENGTH；
 * 不合法时返回 undefined，退回 width × depth 的矩形外墙。不去掉共线点：外墙名 e{k} 要与模型给的序号一致。
 */
export function parseOutline(value: unknown, width: number, depth: number): Point[] | undefined {
  if (!Array.isArray(value) || value.length < 4 || value.length > 40) return undefined;
  if (!value.every((p) => Array.isArray(p) && p.length === 2 && p.every((n) => num(n) !== undefined))) return undefined;
  const ring = (value as Point[]).map(([x, y]): Point => [round10(clamp(x, 0, width)), round10(clamp(y, 0, depth))]);
  const valid = ring.every((a, i) => {
    const b = ring[(i + 1) % ring.length];
    const length = Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]);
    return (a[0] === b[0] || a[1] === b[1]) && length >= MIN_WALL_LENGTH;
  });
  return valid && ringArea(ring) / 1e6 >= MIN_ROOM_AREA ? ring : undefined;
}

/**
 * 整户户型候选 → PlanSpec：只取外轮廓、内墙、门窗、房间与家具，外墙由渲染器生成
 * （给了合法 outline 就沿它生成，外墙名 e1、e2…；否则按长宽生成矩形，外墙名 top/right/bottom/left）。
 * - 墙 key 与房间 id 全部重新命名（w- / r-），避免与外墙名或彼此撞 id 导致方案加载失败；
 *   门窗与家具通过「原名 → 新名」映射重新对上。
 * - 越界 / 重叠的门窗、碎墙、过小的房间、目录外的家具都丢弃；房间或家具全部不可用时抛错。
 */
export function sanitizePlan(value: unknown, { catalog }: { catalog: AiCatalog }): PlanSpec {
  const raw = (value ?? {}) as { width?: unknown; depth?: unknown; outline?: unknown; walls?: unknown; openings?: unknown; rooms?: unknown; furniture?: unknown };
  // 长宽由模型按需求描述决定（用户把长宽写在描述里）；这里只把模型给的尺寸夹进合理范围。
  const sizeOf = (given: unknown) => {
    const n = num(given);
    if (n === undefined) throw new Error("方案缺少户型尺寸");
    return round10(clamp(n, 3000, 40000));
  };
  const width = sizeOf(raw.width), depth = sizeOf(raw.depth);
  const outline = parseOutline(raw.outline, width, depth);
  const outer = outerEdgesOf(outline, width, depth);
  // 外墙名 → [沿墙方向, 起点, 终点]；内墙 key 不能与外墙名相同。
  const outerSpans = new Map<string, ["h" | "v", number, number]>(
    outline
      ? outline.map((a, i) => {
          const b = outline[(i + 1) % outline.length];
          const dir = a[1] === b[1] ? "h" : "v";
          const [p, q] = dir === "h" ? [a[0], b[0]] : [a[1], b[1]];
          return [outlineEdgeKey(i), [dir, Math.min(p, q), Math.max(p, q)]];
        })
      : [["top", ["h", 0, width]], ["bottom", ["h", 0, width]], ["left", ["v", 0, depth]], ["right", ["v", 0, depth]]],
  );
  const list = (v: unknown) => (Array.isArray(v) ? v : []);

  const walls: WallSpec[] = [];
  const wallKeys = new Map<string, string>();
  for (const entry of list(raw.walls)) {
    const w = (entry ?? {}) as { key?: unknown; dir?: unknown; at?: unknown; from?: unknown; to?: unknown };
    const key = text(w.key), at = num(w.at);
    // 外墙名是保留字：模型把它们当内墙 key 用会造成歧义，直接丢弃。
    if (!key || OUTER_NAMES.includes(key) || outerSpans.has(key) || wallKeys.has(key) || (w.dir !== "h" && w.dir !== "v") || at === undefined) continue;
    const across = w.dir === "h" ? depth : width, limit = w.dir === "h" ? width : depth;
    if (at < MIN_WALL_OFFSET || at > across - MIN_WALL_OFFSET) continue;
    // 顶到外墙的一端吸附到外轮廓上，墙端与外墙内表面之间不留缝。
    const ends = [clamp(num(w.from) ?? 0, 0, limit), clamp(num(w.to) ?? limit, 0, limit)]
      .map((end) => snapWallEnd(w.dir as "h" | "v", at, end, outer))
      .sort((a, b) => a - b);
    if (ends[1] - ends[0] < MIN_WALL_LENGTH) continue;
    const next = `w-${walls.length + 1}`;
    wallKeys.set(key, next);
    walls.push({ key: next, dir: w.dir, at: round10(at), from: round10(ends[0]), to: round10(ends[1]) });
  }

  const spanOf = (key: string): [string, "h" | "v", number, number] | undefined => {
    const edge = outerSpans.get(key);
    if (edge) return [key, ...edge];
    const wall = walls.find((w) => w.key === wallKeys.get(key));
    return wall && [wall.key, wall.dir, wall.from, wall.to];
  };
  const openings: OpeningSpec[] = [];
  const cuts = new Map<string, [number, number][]>();
  for (const entry of list(raw.openings)) {
    const o = (entry ?? {}) as { wall?: unknown; kind?: unknown; at?: unknown; width?: unknown; into?: unknown; hinge?: unknown };
    const span = spanOf(text(o.wall) ?? ""), at = num(o.at);
    if (!span || (o.kind !== "door" && o.kind !== "window") || at === undefined) continue;
    const [wall, dir, from, to] = span;
    const size = round10(clamp(num(o.width) ?? (o.kind === "door" ? 900 : 1500), 600, o.kind === "door" ? 2400 : 3600));
    // 洞口两侧各留 100mm 墙垛。
    if (to - from < size + 200) continue;
    const center = round10(clamp(at, from + size / 2 + 100, to - size / 2 - 100));
    const used = cuts.get(wall) ?? [];
    if (used.some(([a, b]) => center - size / 2 < b + 100 && center + size / 2 > a - 100)) continue;
    cuts.set(wall, [...used, [center - size / 2, center + size / 2]]);
    const horizontal = dir === "h";
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
    const ring = netRing(source.map(([x, y]): Point => [round10(clamp(x, 0, width)), round10(clamp(y, 0, depth))]), walls, outer);
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
      .map((item) => toSpec(item as RawPlaced, target.zone, catalog, INNER_WALL / 2))
      .filter((spec): spec is FurnitureSpec => !!spec);
    if (!items.length) continue;
    budget -= items.length;
    furniture.push({ zone: target.zone, items: rugsFirst(items) });
  }

  return { id: "ai", width: Math.round(width), depth: Math.round(depth), ...(outline ? { outline } : {}), walls, openings, rooms, furniture };
}
