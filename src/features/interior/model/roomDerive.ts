import polygonClipping from 'polygon-clipping';
import { bbox, inRing, length, rect, wallPoly } from './geometry';
import { connectedWallPoly } from './wallConnections';
import { JOIN_TOLERANCE, baseName, freeName, netArea, openRing, wallFootprints } from './roomRegions';
import { migrateSeparators } from './separators';
import { uid, type Design, type Point, type Room, type Separator, type Wall } from './types';

/** 房间面积门槛（mm²，即 0.3 m²）：飘窗、储物间都能成房间，墙垛碎块不算。 */
export const MIN_ROOM_AREA = 300_000;
/** 平均宽度门槛（≈ 2 × 面积 / 周长，mm）：比它窄的是墙缝，不算房间。 */
export const MIN_ROOM_WIDTH = 200;
/** 分隔线在求差时的宽度（mm）：足够切开区域，画面上看不出。 */
const SEPARATOR_WIDTH = 1;
const FRAME_MARGIN = 1000;
/** 与旧房间的重叠至少占两者中较小者的这个比例，才沿用旧房间的属性。 */
const MATCH_SHARE = 0.2;
const MIN_MATCH = 10_000;

type Poly = Point[][];

const asWall = (s: Separator, thickness = SEPARATOR_WIDTH): Wall => ({ id: s.id, a: s.a, b: s.b, thickness, kind: 'partition' });
const usableSeparators = (d: Design) => (d.separators ?? []).filter(s => length(asWall(s)) >= 1);
/** 点到线段的距离。 */
function segmentDistance(p: Point, a: Point, b: Point) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0;
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
}
/** 端点已贴在墙上或另一条分隔线上：只伸出 1 mm 封口；悬空的端点伸出 JOIN_TOLERANCE，差几厘米也能闭合。 */
function endReach(p: Point, self: Separator, d: Design) {
  const onWall = d.walls.some(w => !d.demolished.includes(w.id) && w.kind !== 'low' && segmentDistance(p, w.a, w.b) <= w.thickness / 2 + 2);
  const onLine = (d.separators ?? []).some(s => s.id !== self.id && segmentDistance(p, s.a, s.b) <= 2);
  return onWall || onLine ? SEPARATOR_WIDTH : JOIN_TOLERANCE;
}
/** 分隔线参与划分的细带。 */
export function separatorStrip(s: Separator, d: Design): Point[] {
  const L = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
  const u: Point = [(s.b[0] - s.a[0]) / L, (s.b[1] - s.a[1]) / L];
  const ra = endReach(s.a, s, d), rb = endReach(s.b, s, d);
  return wallPoly(asWall({ ...s, a: [s.a[0] - u[0] * ra, s.a[1] - u[1] * ra], b: [s.b[0] + u[0] * rb, s.b[1] + u[1] * rb] }));
}

const lowFootprints = (d: Design): Point[][] =>
  d.walls
    .filter(w => !d.demolished.includes(w.id) && w.kind === 'low' && length(w) > 0.01)
    .flatMap(w => [connectedWallPoly(w, d.walls, d.demolished), wallPoly(w, JOIN_TOLERANCE)]);

const perimeter = (ring: Point[]) => ring.reduce((s, p, i) => {
  const q = ring[(i + 1) % ring.length]!;
  return s + Math.hypot(q[0] - p[0], q[1] - p[1]);
}, 0);
const round = (v: number) => Math.round(v * 1000) / 1000;
const tidy = (poly: Point[][]): Poly => poly.map(r => openRing(r).map(([x, y]) => [round(x), round(y)] as Point));

/** 一块区域够不够当房间：面积 ≥ 0.3 m²、平均宽度 ≥ 200 mm。 */
export const isRoomSized = (rings: Poly) =>
  rings[0]!.length >= 3 && netArea(rings) >= MIN_ROOM_AREA && (2 * netArea(rings)) / perimeter(rings[0]!) >= MIN_ROOM_WIDTH;

/**
 * 被墙体（不含矮墙）和分隔线围住的全部区域，含面积不够房间的碎块。
 * 室外 = 外框减去全部墙体（含矮墙）与分隔线后连通外框的那块；矮墙不分隔房间，但能围住阳台。
 */
export function enclosedRegions(d: Design): Poly[] {
  const dividers = [...wallFootprints(d), ...usableSeparators(d).map(s => separatorStrip(s, d))];
  if (!dividers.length) return [];
  const low = lowFootprints(d);
  const box = bbox([...dividers, ...low].flat());
  const frame = rect(box.x - FRAME_MARGIN, box.y - FRAME_MARGIN, box.x2 - box.x + FRAME_MARGIN * 2, box.y2 - box.y + FRAME_MARGIN * 2);
  const probe: Point = [frame[0]![0] + 1, frame[0]![1] + 1];
  try {
    const regions = polygonClipping.difference([frame], ...dividers.map(p => [p])) as Poly[];
    if (!low.length) return regions.filter(r => !inRing(probe, r[0]!)).map(tidy);
    const sealed = polygonClipping.difference([frame], ...[...dividers, ...low].map(p => [p])) as Poly[];
    const outside = sealed.find(r => inRing(probe, r[0]!));
    const inside = outside ? (polygonClipping.difference(regions, outside) as Poly[]) : regions.filter(r => !inRing(probe, r[0]!));
    return inside.map(tidy);
  } catch {
    return [];
  }
}

function overlapArea(a: Poly, b: Poly): number {
  try {
    return (polygonClipping.intersection(a, b) as Poly[]).reduce((s, p) => s + netArea(p.map(openRing)), 0);
  } catch {
    return 0;
  }
}
const boxesMeet = (a: ReturnType<typeof bbox>, b: ReturnType<typeof bbox>) => a.x < b.x2 && b.x < a.x2 && a.y < b.y2 && b.y < a.y2;

/**
 * 房间 = 墙体与分隔线围出的区域，每次改动后整体重算。
 * 名称、材质、计价开关按与 previous 的重叠面积贪心沿用：
 * - 一间房被切开：重叠最大的一块保留原 id，其余新建，名称加序号、材质照旧；
 * - 几间房并成一块：沿用重叠最大的那间；
 * - 全新围出的区域：「房间 n」，木地板。
 * 结果与当前房间完全一致时返回原对象。旧数据（没有 separators）先按旧房间轮廓迁移。
 */
export function deriveRooms(d: Design, previous: Room[] = d.rooms): Design {
  if (!d.separators) return migrateSeparators(d);
  const pieces = enclosedRegions(d).filter(isRoomSized);
  const prev = previous
    .filter(r => r.rings[0] && r.rings[0].length >= 3)
    .map((room, index) => ({ room, index, box: bbox(room.rings[0]!), area: netArea(room.rings) }));
  const info = pieces.map(rings => ({ rings, box: bbox(rings[0]!), area: netArea(rings) }));
  const pairs: { piece: number; prev: number; overlap: number }[] = [];
  info.forEach((p, i) => prev.forEach((q, j) => {
    if (!boxesMeet(p.box, q.box)) return;
    const overlap = overlapArea(p.rings, q.room.rings);
    if (overlap >= MIN_MATCH && overlap >= MATCH_SHARE * Math.min(p.area, q.area)) pairs.push({ piece: i, prev: j, overlap });
  }));
  pairs.sort((a, b) => b.overlap - a.overlap);
  const owner = new Map<number, number>(), used = new Set<number>(), parent = new Map<number, number>();
  for (const pair of pairs) {
    if (!parent.has(pair.piece)) parent.set(pair.piece, pair.prev);
    if (owner.has(pair.piece) || used.has(pair.prev)) continue;
    owner.set(pair.piece, pair.prev);
    used.add(pair.prev);
  }
  const names = new Set(previous.map(r => r.name));
  const kept: { room: Room; order: number }[] = [];
  const added: { room: Room; area: number; source?: Room }[] = [];
  info.forEach((p, i) => {
    const own = owner.get(i);
    if (own !== undefined) { kept.push({ room: { ...prev[own]!.room, rings: p.rings }, order: prev[own]!.index }); return; }
    const from = parent.get(i), source = from === undefined ? undefined : prev[from]!.room;
    added.push({ room: source ? { ...source, id: uid(), rings: p.rings } : { id: uid(), name: '', rings: p.rings, mat: 'wood' }, area: p.area, source });
  });
  // 新房间按面积从大到小命名，序号稳定。
  added.sort((a, b) => b.area - a.area);
  for (const item of added) {
    item.room.name = item.source ? freeName(baseName(item.source.name), names) : nextRoomName(names);
    names.add(item.room.name);
  }
  const rooms = [...kept.sort((a, b) => a.order - b.order).map(k => k.room), ...added.map(a => a.room)];
  return JSON.stringify(rooms) === JSON.stringify(d.rooms) ? d : { ...d, rooms };
}

function nextRoomName(taken: Set<string>) {
  for (let i = 1; ; i++) if (!taken.has(`房间 ${i}`)) return `房间 ${i}`;
}
