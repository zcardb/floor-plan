import type { Box, OpeningSpec, PlanSpec, RoomSpec, Side, WallSpec } from '../data/floorplanBuilder';
import { INNER_WALL } from '../data/floorplanBuilder';
import { materials } from '../data/catalog';
import { validFurnitureType } from '../model/furnitureAppearance';
import type { AiCatalog } from './catalog';
import { resolveCode } from './catalog';

/** 模型返回的家具项：只引用目录代号。 */
export interface AiPlacedItem {
  code: string;
  back: Side;
  along?: number;
  gap?: number;
  w?: number;
  d?: number;
}

export interface AiRoomPlan {
  items: AiPlacedItem[];
  note: string;
}

export class AiDesignError extends Error {}

const SIDES: Side[] = ['up', 'down', 'left', 'right'];
const isSide = (v: unknown): v is Side => SIDES.includes(v as Side);

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null;

/** 坐标统一取整到 10mm，并夹到轮廓内。 */
const snap = (v: number) => Math.round(v / 10) * 10;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const MIN_WALL = 600;
const MIN_ROOM_AREA = 2e6;
const MIN_OPENING = 700;
const MAX_OPENING = 1800;
const MIN_FURNITURE = 200;
const MAX_FURNITURE = 4000;
const MAX_ITEMS_PER_ZONE = 25;
const MAX_ITEMS_TOTAL = 60;
const OUTER_WALLS = ['top', 'right', 'bottom', 'left'];

interface RawPlan {
  walls?: unknown;
  openings?: unknown;
  rooms?: unknown;
  furniture?: unknown;
}

/**
 * 把模型返回的户型清洗成可落地的 PlanSpec。
 * 一路只做「修」和「丢」：修坐标，丢掉不合法的墙 / 房间 / 开口 / 家具。
 * 房间或内墙全部不合法时直接报错，绝不返回空方案。
 */
export function sanitizePlanSpec(raw: unknown, { width, depth, catalog }: { width: number; depth: number; catalog: AiCatalog }): PlanSpec {
  const source = (raw ?? {}) as RawPlan;
  const w = Math.round(width);
  const d = Math.round(depth);
  // 墙 key 与房间 id 都要重命名，避免与渲染器内的其它 id 相撞。
  const wallKeys = new Set<string>();
  const walls: WallSpec[] = [];
  for (const [i, item] of (Array.isArray(source.walls) ? source.walls : []).entries()) {
    const entry = item as Record<string, unknown>;
    const dir = entry.dir === 'h' || entry.dir === 'v' ? entry.dir : null;
    const at = num(entry.at);
    const from = num(entry.from);
    const to = num(entry.to);
    if (!dir || at === null || from === null || to === null) continue;
    const limit = dir === 'h' ? w : d;
    const lo = clamp(snap(Math.min(from, to)), 0, limit);
    const hi = clamp(snap(Math.max(from, to)), 0, limit);
    if (hi - lo < MIN_WALL) continue;
    const axisAt = clamp(snap(at), INNER_WALL, (dir === 'h' ? d : w) - INNER_WALL);
    if (axisAt <= INNER_WALL || axisAt >= (dir === 'h' ? d : w) - INNER_WALL) continue;
    const key = `w-${dir}-${i}`;
    if (wallKeys.has(key)) continue;
    wallKeys.add(key);
    walls.push({ key, dir, at: axisAt, from: lo, to: hi, thickness: INNER_WALL });
  }
  if (!walls.length && Array.isArray(source.walls) && source.walls.length) {
    throw new AiDesignError('AI 返回的内墙都无法使用，请重试');
  }

  const rooms: RoomSpec[] = [];
  const roomIds = new Set<string>();
  for (const [i, item] of (Array.isArray(source.rooms) ? source.rooms : []).entries()) {
    const entry = item as Record<string, unknown>;
    const name = typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim().slice(0, 20) : `房间 ${i + 1}`;
    const mat = typeof entry.mat === 'string' && entry.mat in materials ? entry.mat : 'wood';
    const box = boxOf(entry.box, w, d);
    const poly = box ? undefined : polyOf(entry.poly, w, d);
    if (!box && !poly) continue;
    const ring = box ? boxRing(box) : (poly as [number, number][]);
    if (ringAreaOf(ring) < MIN_ROOM_AREA) continue;
    const id = `r-${i}-${slug(name)}`;
    if (roomIds.has(id)) continue;
    roomIds.add(id);
    rooms.push({ id, name, mat, ...(box ? { box } : { poly: ring }) });
  }
  if (!rooms.length) throw new AiDesignError('AI 返回的房间都无法使用，请重试');

  const roomOf = (id: unknown) => (typeof id === 'string' ? rooms.find((r) => r.id === id) : undefined);
  const openings: OpeningSpec[] = [];
  const used = new Map<string, [number, number][]>();
  for (const item of Array.isArray(source.openings) ? source.openings : []) {
    const entry = item as Record<string, unknown>;
    const wallRef = typeof entry.wall === 'string' ? entry.wall.trim() : '';
    const kind = entry.kind === 'door' || entry.kind === 'window' ? entry.kind : null;
    const at = num(entry.at);
    const rawWidth = num(entry.width);
    if (!kind || at === null) continue;
    const key = resolveWallRef(wallRef, wallKeys, OUTER_WALLS);
    if (!key) continue;
    const axis = axisOf(key, walls, w, d);
    if (!axis) continue;
    const width = clamp(snap(rawWidth ?? (kind === 'door' ? 900 : 1500)), MIN_OPENING, MAX_OPENING);
    const [lo, hi] = axis;
    let center = clamp(snap(at), lo + width / 2, hi - width / 2);
    if (hi - lo < width) continue;
    const taken = used.get(key) ?? [];
    // 同一面墙上不能重叠：与已有洞口冲突时，顺着一端挪开，挪不开就丢弃。
    const fits = () => taken.every(([s, e]) => center + width / 2 <= s || center - width / 2 >= e);
    if (!fits()) {
      const shifted = taken.reduce<number | null>((acc, [, e]) => {
        const candidate = e + width / 2;
        return candidate + width / 2 <= hi ? candidate : acc;
      }, null);
      if (shifted === null) continue;
      center = shifted;
      if (!fits()) continue;
    }
    taken.push([center - width / 2, center + width / 2]);
    used.set(key, taken);
    const into = isSide(entry.into) ? entry.into : undefined;
    openings.push({ wall: key, kind, at: center, width, ...(kind === 'door' && into ? { into: swingSideFor(key, walls, key.startsWith('top') || key === 'bottom' ? 'h' : 'v', into) } : {}) });
  }

  const furniture: PlanSpec['furniture'] = [];
  let itemCount = 0;
  const zones = Array.isArray(source.furniture) ? source.furniture : [];
  for (const item of zones) {
    const entry = item as Record<string, unknown>;
    const room = roomOf(entry.roomId ?? entry.room);
    if (!room) continue;
    const zone = zoneBoxOf(room);
    const items: PlanSpec['furniture'][number]['items'] = [];
    for (const raw of Array.isArray(entry.items) ? entry.items : []) {
      if (items.length >= MAX_ITEMS_PER_ZONE || itemCount >= MAX_ITEMS_TOTAL) break;
      const placed = placedItemOf(raw, zone, catalog);
      if (!placed) continue;
      items.push(placed);
      itemCount++;
    }
    if (items.length) furniture.push({ zone, items });
  }

  return { id: 'ai', width: w, depth: d, thickness: 240, height: 2800, walls, openings, rooms, furniture };
}

/** 房间布局：只返回目标房间内的家具。 */
export function sanitizeRoomPlan(raw: unknown, { zone, catalog, required }: { zone: Box; catalog: AiCatalog; required: { code: string; count: number }[] }): AiPlacedItem[] {
  const source = (raw ?? {}) as { items?: unknown };
  const items: AiPlacedItem[] = [];
  for (const rawItem of Array.isArray(source.items) ? source.items : []) {
    if (items.length >= MAX_ITEMS_PER_ZONE) break;
    const placed = placedItemOf(rawItem, zone, catalog);
    if (placed) items.push(placed);
  }
  if (!items.length) throw new AiDesignError('AI 没有给出可用的家具方案，请重试');
  return items;
}

/** 校验结果是否满足「必须包含的家具」：数量一致，且选用指定家具时不允许出现其它家具。 */
export function matchesRequired(items: AiPlacedItem[], required: { code: string; count: number }[]): boolean {
  if (!required.length) return true;
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item.code, (counts.get(item.code) ?? 0) + 1);
  const allowed = new Set(required.map((r) => r.code));
  for (const [code, count] of counts) {
    if (!allowed.has(code)) return false;
    if (count !== required.find((r) => r.code === code)?.count) return false;
  }
  return required.every((r) => (counts.get(r.code) ?? 0) === r.count);
}

function placedItemOf(raw: unknown, zone: Box, catalog: AiCatalog): AiPlacedItem | null {
  const entry = (raw ?? {}) as Record<string, unknown>;
  const catalogEntry = resolveCode(catalog, entry.code ?? entry.type ?? entry.name);
  if (!catalogEntry) return null;
  if (!validFurnitureType(catalogEntry.type)) return null;
  const back = isSide(entry.back) ? entry.back : 'up';
  const [x1, y1, x2, y2] = zone;
  const horizontal = back === 'up' || back === 'down';
  const w = clamp(num(entry.w) === null ? catalogEntry.w : snap(num(entry.w)!), MIN_FURNITURE, MAX_FURNITURE);
  const d = clamp(num(entry.d) === null ? catalogEntry.d : snap(num(entry.d)!), MIN_FURNITURE, MAX_FURNITURE);
  const span = horizontal ? x2 - x1 : y2 - y1;
  const depth = (horizontal ? w : d) / 2;
  const along = clamp(num(entry.along) === null ? span / 2 : snap(num(entry.along)!), depth, Math.max(depth, span - depth));
  const gap = clamp(num(entry.gap) === null ? 0 : snap(num(entry.gap)!), 0, 600);
  return { code: catalogEntry.code, back, along, gap, w, d };
}

/** 把代号解析回家具素材（摆放时用），代号无效返回 null。 */
export function entryFor(catalog: AiCatalog, code: string) {
  return resolveCode(catalog, code);
}

const slug = (name: string) => {
  const ascii = name.replace(/[^\w\u4e00-\u9fa5]+/g, '').slice(0, 8);
  return ascii || 'room';
};

function boxOf(value: unknown, w: number, d: number): Box | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const nums = value.map(num);
  if (nums.some((n) => n === null)) return null;
  const [x1, y1, x2, y2] = (nums as number[]).map(snap);
  const box: Box = [clamp(Math.min(x1, x2), 0, w), clamp(Math.min(y1, y2), 0, d), clamp(Math.max(x1, x2), 0, w), clamp(Math.max(y1, y2), 0, d)];
  return box[2] - box[0] >= 700 && box[3] - box[1] >= 700 ? box : null;
}

function polyOf(value: unknown, w: number, d: number): [number, number][] | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const points: [number, number][] = [];
  for (const p of value) {
    if (!Array.isArray(p) || p.length < 2) return null;
    const x = num(p[0]), y = num(p[1]);
    if (x === null || y === null) return null;
    points.push([clamp(snap(x), 0, w), clamp(snap(y), 0, d)]);
  }
  return ringAreaOf(points) >= MIN_ROOM_AREA ? points : null;
}

const boxRing = ([x1, y1, x2, y2]: Box): [number, number][] => [
  [x1, y1],
  [x2, y1],
  [x2, y2],
  [x1, y2],
];

/** 多边形的实际面积（mm²），用来过滤过小的房间。 */function ringAreaOf(ring: [number, number][]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

/** 房间的摆放分区 = 房间矩形外框；多边形房间用外框近似。 */
function zoneBoxOf(room: RoomSpec): Box {
  if (room.box) return room.box;
  const ring = room.poly ?? [];
  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** 开口引用的墙：内墙用 key，外围墙用 top / right / bottom / left。 */
function resolveWallRef(ref: string, keys: Set<string>, outer: string[]): string | null {
  if (!ref) return null;
  if (keys.has(ref)) return ref;
  const lower = ref.toLowerCase();
  if (outer.includes(lower)) return lower;
  // 模型有时写「北墙 / 南墙 / 东墙 / 西墙」，按下方为南的约定映射。
  const byName: Record<string, string> = { top: 'top', north: 'top', 北: 'top', 上: 'top', bottom: 'bottom', south: 'bottom', 南: 'bottom', 下: 'bottom', left: 'left', west: 'left', 西: 'left', 左: 'left', right: 'right', east: 'right', 东: 'right', 右: 'right' };
  for (const [needle, wall] of Object.entries(byName)) if (lower.includes(needle)) return wall;
  return null;
}

/** 取墙的可开口区间（沿墙方向的世界坐标）。 */
function axisOf(key: string, walls: WallSpec[], w: number, d: number): [number, number] | null {
  if (key === 'top' || key === 'bottom') return [0, w];
  if (key === 'left' || key === 'right') return [0, d];
  const wall = walls.find((x) => x.key === key);
  return wall ? [wall.from, wall.to] : null;
}

/** 门开向：外墙与内墙的合法方向不同，非法时退回一个可用方向。 */
function swingSideFor(key: string, walls: WallSpec[], fallbackDir: 'h' | 'v', into: Side): Side {
  const dir = OUTER_WALLS.includes(key) ? (key === 'top' || key === 'bottom' ? 'h' : 'v') : walls.find((x) => x.key === key)?.dir ?? fallbackDir;
  const legal: Side[] = dir === 'h' ? ['up', 'down'] : ['left', 'right'];
  if (legal.includes(into)) return into;
  return dir === 'h' ? (key === 'top' ? 'down' : 'up') : key === 'left' ? 'right' : 'left';
}
