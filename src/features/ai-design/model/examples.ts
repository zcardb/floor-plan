import { INNER_WALL, libraryResolver, type Box, type FurnitureSpec, type FurnitureZone, type PlanSpec } from "./floorplan-builder";
import { AI_EXAMPLE_PLANS, type ExamplePlan } from "./example-plans";
import { catalogIdOf, isBuiltinItem } from "@/lib/floor-plan/catalog";
import { roomContext } from "./context";
import type { AiCatalog, AiCatalogEntry, AiPlacedItem, AiPlanExample, AiRoomContext, AiRoomExample } from "../types";

/**
 * 把算法范例户型（见 examplePlans.ts）序列化成 AI 输出约定下的「标准答案」，随请求发给模型做范例（few-shot）。
 * 家具代号每次请求现分配，所以范例必须按本次目录现算；范例户型改了范例自动同步。
 */

const SEAT_TYPES = new Set(["chair", "officechair", "barstool"]);
const TABLE_TYPES = new Set(["table", "roundtable", "coffeetable", "desk", "island", "counter"]);
const COUNTER_INSETS = new Set(["stove", "ksink"]);
/** 与后端校验一致的越界容差。 */
const TOLERANCE = 30;
const ROOM_EXAMPLE_LIMIT = 3;

type Size = Pick<AiCatalogEntry, "w" | "d" | "type">;

/** 家具在分区（相对坐标 0..W × 0..D）里的占地矩形，与后端 footprint 同一算法。 */
function footprint(p: AiPlacedItem, e: Size, W: number, D: number): Box {
  const horizontal = p.back === "up" || p.back === "down";
  const along = p.along ?? (horizontal ? W : D) / 2;
  const gap = p.gap ?? 0;
  const [w, d] = horizontal ? [e.w, e.d] : [e.d, e.w];
  const cx = horizontal ? along : p.back === "left" ? gap + e.d / 2 : W - gap - e.d / 2;
  const cy = !horizontal ? along : p.back === "up" ? gap + e.d / 2 : D - gap - e.d / 2;
  return [cx - w / 2, cy - d / 2, cx + w / 2, cy + d / 2];
}

/** 允许的正常重叠：地毯、椅子收进桌下、灶台 / 水槽完全嵌在台面上（与后端校验一致）。 */
function allowedOverlap(a: Size, boxA: Box, b: Size, boxB: Box) {
  if (a.type === "rug" || b.type === "rug") return true;
  const [inset, counter] = COUNTER_INSETS.has(a.type) && b.type === "counter" ? [boxA, boxB] : a.type === "counter" && COUNTER_INSETS.has(b.type) ? [boxB, boxA] : [null, null];
  if (inset && counter)
    return inset[0] >= counter[0] - TOLERANCE && inset[1] >= counter[1] - TOLERANCE && inset[2] <= counter[2] + TOLERANCE && inset[3] <= counter[3] + TOLERANCE;
  const seat = SEAT_TYPES.has(a.type) && TABLE_TYPES.has(b.type) ? boxA : TABLE_TYPES.has(a.type) && SEAT_TYPES.has(b.type) ? boxB : null;
  if (!seat) return false;
  const table = seat === boxA ? boxB : boxA;
  return Math.max(table[0] - seat[0], seat[2] - table[2], table[1] - seat[1], seat[3] - table[3]) >= 100;
}

/**
 * 模板家具 → 本次目录条目 + 摆放位置。模板给了覆盖尺寸（台面、电视柜等）时，
 * AI 契约里家具尺寸固定取目录值：覆盖长度达到目录件两倍以上的（整面台面）沿墙连续排多段，
 * 否则在内置素材里挑同类型中尺寸最接近的一件。
 */
function entriesFor(spec: FurnitureSpec, catalog: AiCatalog): { entry: AiCatalogEntry; along?: number }[] {
  const item = libraryResolver(spec);
  const base = item && catalog.entries.find((e) => e.catalogId === catalogIdOf(item));
  if (!base) return [];
  if (spec.w === undefined && spec.d === undefined) return [{ entry: base, along: spec.along }];
  const w = spec.w ?? base.w, d = spec.d ?? base.d;
  if (spec.along !== undefined && w >= base.w * 2) {
    const n = Math.floor(w / base.w);
    return Array.from({ length: n }, (_, k) => ({ entry: base, along: spec.along! + (k - (n - 1) / 2) * base.w }));
  }
  const miss = (e: AiCatalogEntry) => Math.abs(e.w - w) + Math.abs(e.d - d);
  const entry = catalog.entries
    .filter((e) => e.type === spec.type && isBuiltinItem(e))
    .reduce((best, e) => (miss(e) < miss(best) ? e : best), base);
  return [{ entry, along: spec.along }];
}

/** 一个分区的家具 → 范例条目；按目录尺寸自检，越界或非法重叠的件不进范例，保证范例本身能通过校验。 */
function zoneItems({ zone, items }: FurnitureZone, catalog: AiCatalog): AiPlacedItem[] {
  const W = zone[2] - zone[0], D = zone[3] - zone[1];
  const kept: { size: Size; box: Box }[] = [];
  const out: AiPlacedItem[] = [];
  for (const spec of items) for (const { entry, along } of entriesFor(spec, catalog)) {
    const placed: AiPlacedItem = { code: entry.code, back: spec.back, ...(along !== undefined ? { along: Math.round(along) } : {}), ...(spec.gap ? { gap: Math.round(spec.gap) } : {}) };
    const box = footprint(placed, entry, W, D);
    if (box[0] < -TOLERANCE || box[1] < -TOLERANCE || box[2] > W + TOLERANCE || box[3] > D + TOLERANCE) continue;
    if (kept.some((k) => {
      const ox = Math.min(box[2], k.box[2]) - Math.max(box[0], k.box[0]);
      const oy = Math.min(box[3], k.box[3]) - Math.max(box[1], k.box[1]);
      return ox > 50 && oy > 50 && !allowedOverlap(entry, box, k.size, k.box);
    })) continue;
    kept.push({ size: entry, box });
    out.push(placed);
  }
  return out;
}

const sameBox = (a: Box, b: Box) => a.every((n, i) => n === b[i]);

/** 模板房间的净空矩形 → 契约要求的墙中心线矩形：不贴外轮廓的边向外扩半个内墙厚。 */
function centerlineBox([x1, y1, x2, y2]: Box, width: number, depth: number): Box {
  const h = INNER_WALL / 2;
  return [x1 > 0 ? x1 - h : x1, y1 > 0 ? y1 - h : y1, x2 < width ? x2 + h : x2, y2 < depth ? y2 + h : y2];
}

function planOutput(preset: ExamplePlan, spec: PlanSpec, catalog: AiCatalog): AiPlanExample["output"] {
  const rooms = spec.rooms.filter((r): r is typeof r & { box: Box } => !!r.box);
  return {
    summary: preset.name,
    width: spec.width,
    depth: spec.depth,
    walls: spec.walls.map(({ key, dir, at, from, to }) => ({ key, dir, at, from, to })),
    rooms: rooms.map((r) => ({ id: r.id, name: r.name, mat: r.mat, box: centerlineBox(r.box, spec.width, spec.depth) })),
    // 契约要求「用户没说铰链就不输出 hinge」，范例里同样省略。
    openings: spec.openings.map(({ wall, kind, at, width, into }) => ({ wall, kind, at: Math.round(at), width, ...(into ? { into } : {}) })),
    furniture: spec.furniture.flatMap((zone) => {
      const room = rooms.find((r) => sameBox(r.box, zone.zone));
      const items = room ? zoneItems(zone, catalog) : [];
      return room && items.length ? [{ room: room.id, items }] : [];
    }),
  };
}

const metres = (mm: number) => `${+(mm / 1000).toFixed(1)} m`;

/** 整户范例：每套范例户型一条（需求描述 + 完整 JSON 答案）。 */
export function planExamples(catalog: AiCatalog): AiPlanExample[] {
  return AI_EXAMPLE_PLANS.map((plan) => {
    const spec = plan.spec();
    return {
      requirement: `${plan.layout}，长 ${metres(spec.width)} × 宽 ${metres(spec.depth)}；${plan.description}`,
      output: planOutput(plan, spec, catalog),
    };
  });
}

/** 房间类别：按名称关键词归类，顺序有意义（「主卫」先归卫生间，「卧室阳台」先归阳台）。 */
const ROOM_KINDS: [string, RegExp][] = [
  ["bathroom", /卫|浴|洗手间|厕/],
  ["kitchen", /厨/],
  ["balcony", /阳台/],
  ["hall", /玄关|过道|走廊|门厅/],
  ["bedroom", /卧|儿童房|老人房|客房/],
  ["living", /客厅|餐厅|客餐|起居/],
];
export const roomKindOf = (name: string) => ROOM_KINDS.find(([, pattern]) => pattern.test(name))?.[0];

interface TemplateRoom {
  kind: string;
  name: string;
  context: AiRoomContext;
  zone: FurnitureZone;
}

let templateRoomCache: TemplateRoom[] | null = null;

/** 全部范例户型里带家具的房间（与目录无关，算一次缓存）。门窗取自建好的方案，和真实请求同一格式。 */
function templateRooms(): TemplateRoom[] {
  if (templateRoomCache) return templateRoomCache;
  templateRoomCache = AI_EXAMPLE_PLANS.flatMap((plan) => {
    const spec = plan.spec();
    const design = plan.design();
    return spec.rooms.flatMap((r) => {
      const kind = roomKindOf(r.name);
      const zone = r.box && spec.furniture.find((z) => sameBox(z.zone, r.box!));
      const room = design.rooms.find((x) => x.id === r.id);
      return kind && zone && room ? [{ kind, name: r.name, context: roomContext(design, room), zone }] : [];
    });
  });
  return templateRoomCache;
}

/** 单房间范例：同类房间里净空尺寸与目标最接近的几个；没有同类时为空。 */
export function roomExamples(catalog: AiCatalog, target: Pick<AiRoomContext, "name" | "zone">, limit = ROOM_EXAMPLE_LIMIT): AiRoomExample[] {
  const kind = roomKindOf(target.name);
  if (!kind) return [];
  const W = target.zone[2] - target.zone[0], D = target.zone[3] - target.zone[1];
  const seen = new Set<string>();
  return templateRooms()
    .filter((r) => r.kind === kind)
    .map((r) => {
      const [x1, y1, x2, y2] = r.context.zone, w = x2 - x1, d = y2 - y1;
      return { r, w, d, distance: Math.min(Math.abs(w - W) + Math.abs(d - D), Math.abs(w - D) + Math.abs(d - W)) };
    })
    .sort((a, b) => a.distance - b.distance)
    .flatMap(({ r, w, d }) => {
      const example: AiRoomExample = { room: { name: r.name, width: w, depth: d, openings: r.context.openings, edges: r.context.edges }, output: { items: zoneItems(r.zone, catalog) } };
      const key = JSON.stringify(example);
      if (!example.output.items.length || seen.has(key)) return [];
      seen.add(key);
      return [example];
    })
    .slice(0, limit);
}
