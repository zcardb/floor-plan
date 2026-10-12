import { openingRoomIds } from './costs';
import { doorSweeps } from './doorType';
import { openingSill } from './hardMaterials';
import { bbox, inRing, length, nearestOnWall, ringArea, wallPoly } from './geometry';
import { fitsInRoom, footprintCorners } from './roomFit';
import type { Design, Furniture, Point, Room } from './types';

/**
 * 布局硬约束：背靠面、门扇扫掠区、门前通行区、窗前区与过道连通。
 * 这些规则原本只写在提示词里，模型手上没有可验算的数据（不知道哪条边背后是实墙、
 * 哪条边是通向阳台的开间），于是「电视柜背靠开间」这类方案照样通过。
 * 这里把房间每条边背后的真实构造与各类保留区算成几何量，提示词、后端校验与落库校正共用。
 *
 * 同步点：supabase/functions/interior-ai-design/index.ts 里的 BACK_REQUIRED、clipArea、
 * backingOf、passageIssue 与这里是同一套定义（后端无法 import src/），改动时两边一起改。
 */

export type Side = 'up' | 'down' | 'left' | 'right';
export const SIDES: Side[] = ['up', 'down', 'left', 'right'];
const ROT: Record<Side, number> = { up: 0, right: 90, down: 180, left: 270 };

/** 边背后的构造：实墙 / 矮墙栏板 / 窗洞 / 门洞或垭口 / 开敞（分隔线、开间、通向阳台）。 */
export type SpanKind = 'wall' | 'low' | 'window' | 'door' | 'open';
export interface EdgeSpan { from: number; to: number; kind: SpanKind }
/**
 * 房间轮廓的一条横平竖直的边。side 是家具背靠这条边时的 back 取值（up = 房间在边的下方）；
 * at 为边线坐标（横边是 y，竖边是 x），from / to 为沿边范围。
 */
export interface RoomEdge { side: Side; at: number; from: number; to: number; spans: EdgeSpan[] }
export type KeepOutKind = 'doorway' | 'doorSweep' | 'window';
export interface KeepOut { kind: KeepOutKind; poly: Point[] }
export interface RoomLayout {
  room: Room;
  edges: RoomEdge[];
  keepOuts: KeepOut[];
  /** 门 / 垭口内侧的落脚点（过道连通检查的起点）。 */
  doors: Point[];
}

/** 采样步长、探测距离（mm）。 */
const SAMPLE = 50;
const PROBES = [20, 60];
export const DOORWAY_DEPTH = 300;
export const WINDOW_DEPTH = 600;
/** 保留区相交面积超过该值才算压占（mm²）。 */
export const KEEP_OUT_AREA = 5000;
/** 背靠面被实墙覆盖的最低比例；背面离墙超过 BACK_GAP 视为没靠墙。 */
export const BACK_RATIO = 0.7;
export const BACK_GAP = 100;
const BACK_TOLERANCE = 30;
/** 家具高度达到该值才算遮挡窗洞；窗台达到 HIGH_SILL 的高窗不设窗前区。 */
export const TALL = 1200;
const HIGH_SILL = 1900;
/** 过道：100 mm 栅格，5×5 格（约 600 mm 见方）全空才算能走人。 */
const GRID = 100;
const REACH = 2;
const MAX_GRID_CELLS = 250_000;

/** 目录没有高度时按类型取的典型高度（mm）；其余默认 700，视为矮家具。 */
const TYPE_HEIGHT: Record<string, number> = {
  wardrobe: 2000, bookshelf: 1800, fridge: 1800, ovencol: 2000, aircon: 1800,
  shoecab: 1100, cabinet: 900, piano: 1250, waterheater: 1500, acwall: 1500,
};
export const furnitureHeight = (f: { type: string; height?: number }) => f.height || TYPE_HEIGHT[f.type] || 700;

/** 必须背靠实墙的类型：柜类 + 壁挂 / 落地设备（台面与岛台不在其中，水槽常在窗下）。 */
export const BACK_REQUIRED_TYPES = new Set([
  'wardrobe', 'bookshelf', 'shoecab', 'cabinet', 'tvstand', 'fridge', 'ovencol',
  'tv', 'acwall', 'waterheater', 'aircon',
]);

export const SPAN_LABEL: Record<SpanKind | 'none', string> = {
  wall: '实墙', low: '矮墙 / 栏板', window: '窗洞', door: '门洞 / 垭口', open: '开敞边界（没有墙）', none: '空处（离墙太远）',
};

const isHorizontal = (side: Side) => side === 'up' || side === 'down';

/** 房间轮廓里横平竖直的边（斜边不参与背靠判断）。 */
function outlineEdges(ring: Point[]): Omit<RoomEdge, 'spans'>[] {
  return ring.flatMap((a, i) => {
    const b = ring[(i + 1) % ring.length]!;
    const horizontal = Math.abs(a[1] - b[1]) < 0.5, vertical = Math.abs(a[0] - b[0]) < 0.5;
    if (horizontal === vertical) return [];
    const at = horizontal ? (a[1] + b[1]) / 2 : (a[0] + b[0]) / 2;
    const from = Math.min(horizontal ? a[0] : a[1], horizontal ? b[0] : b[1]);
    const to = Math.max(horizontal ? a[0] : a[1], horizontal ? b[0] : b[1]);
    if (to - from < 1) return [];
    const mid = (from + to) / 2;
    const plusInside = inRing(horizontal ? [mid, at + 2] : [at + 2, mid], ring);
    const side: Side = horizontal ? (plusInside ? 'up' : 'down') : (plusInside ? 'left' : 'right');
    return [{ side, at, from, to }];
  });
}

const outwardOf = (side: Side): Point => side === 'up' ? [0, -1] : side === 'down' ? [0, 1] : side === 'left' ? [-1, 0] : [1, 0];

/** 每条边逐段探测背后的构造：墙体内为实墙 / 矮墙，落在洞口范围内为门窗，探不到墙即开敞。 */
export function roomEdges(d: Design, room: Room): RoomEdge[] {
  const ring = room.rings[0];
  if (!ring || ring.length < 3) return [];
  const walls = d.walls.filter((w) => !d.demolished.includes(w.id) && length(w) > 0.01).map((w) => ({ w, poly: wallPoly(w) }));
  const probe = (p: Point, out: Point): SpanKind => {
    for (const reach of PROBES) {
      const q: Point = [p[0] + out[0] * reach, p[1] + out[1] * reach];
      const hit = walls.find(({ poly }) => inRing(q, poly));
      if (!hit) continue;
      const offset = nearestOnWall(q, hit.w).offset;
      const hole = d.openings.find((o) => o.wallId === hit.w.id && Math.abs(offset - o.offset) < o.width / 2);
      if (hole) return hole.kind === 'window' ? 'window' : 'door';
      return hit.w.kind === 'low' ? 'low' : 'wall';
    }
    return 'open';
  };
  return outlineEdges(ring).map((edge) => {
    const out = outwardOf(edge.side);
    const n = Math.max(1, Math.ceil((edge.to - edge.from) / SAMPLE));
    const cell = (edge.to - edge.from) / n;
    const spans: EdgeSpan[] = [];
    for (let k = 0; k < n; k++) {
      const t = edge.from + (k + 0.5) * cell;
      const kind = probe(isHorizontal(edge.side) ? [t, edge.at] : [edge.at, t], out);
      const last = spans[spans.length - 1];
      if (last && last.kind === kind) last.to = edge.from + (k + 1) * cell;
      else spans.push({ from: edge.from + k * cell, to: edge.from + (k + 1) * cell, kind });
    }
    return { ...edge, spans };
  });
}

const centroid = (poly: Point[]): Point => [
  poly.reduce((s, p) => s + p[0], 0) / poly.length,
  poly.reduce((s, p) => s + p[1], 0) / poly.length,
];

/** 门窗在房间内侧的保留区：门前通行区、门扇扫掠区（门扇开向本房间时）、窗前区。 */
export function roomKeepOuts(d: Design, room: Room): { keepOuts: KeepOut[]; doors: Point[] } {
  const ring = room.rings[0];
  const keepOuts: KeepOut[] = [], doors: Point[] = [];
  if (!ring || ring.length < 3) return { keepOuts, doors };
  for (const o of d.openings) {
    const w = d.walls.find((x) => x.id === o.wallId);
    if (!w || d.demolished.includes(w.id) || !openingRoomIds(d, o).includes(room.id)) continue;
    const L = length(w);
    if (!L) continue;
    const dx = (w.b[0] - w.a[0]) / L, dy = (w.b[1] - w.a[1]) / L;
    // 与画布同一变换：局部 x 沿墙（a → b），局部 y 沿 (-dy, dx)。
    const toWorld = ([x, y]: Point): Point => [w.a[0] + dx * (o.offset + x) - dy * y, w.a[1] + dy * (o.offset + x) + dx * y];
    const t = w.thickness / 2, half = o.width / 2;
    // 室内侧：贴着墙面往里探一点，落在房间轮廓里的一侧才是室内。
    const s = inRing(toWorld([0, t + 10]), ring) ? 1 : inRing(toWorld([0, -(t + 10)]), ring) ? -1 : 0;
    if (!s) continue;
    // 保留区从墙面（中心线外 t）起向室内延伸 depth。
    const band = (depth: number): Point[] => [toWorld([-half, s * t]), toWorld([half, s * t]), toWorld([half, s * (t + depth)]), toWorld([-half, s * (t + depth)])];
    if (o.kind === 'window') {
      if (openingSill(o) < HIGH_SILL) keepOuts.push({ kind: 'window', poly: band(WINDOW_DEPTH) });
      continue;
    }
    keepOuts.push({ kind: 'doorway', poly: band(DOORWAY_DEPTH) });
    doors.push(toWorld([0, s * (t + DOORWAY_DEPTH / 2)]));
    if (o.kind !== 'door') continue;
    // 单开一个扫掠区、双开两个；推拉门不占开启范围。
    for (const local of doorSweeps(o)) {
      const sweep = local.map(toWorld);
      if (inRing(centroid(sweep), ring)) keepOuts.push({ kind: 'doorSweep', poly: sweep });
    }
  }
  return { keepOuts, doors };
}

export function roomLayout(d: Design, room: Room): RoomLayout {
  return { room, edges: roomEdges(d, room), ...roomKeepOuts(d, room) };
}

/** 多边形被轴对齐矩形裁剪后的面积（Sutherland–Hodgman）。 */
export function clipArea(poly: Point[], [x1, y1, x2, y2]: [number, number, number, number]): number {
  let out = poly;
  const cut = (inside: (p: Point) => boolean, axis: 0 | 1, value: number) => {
    const next: Point[] = [];
    out.forEach((a, i) => {
      const b = out[(i + 1) % out.length]!;
      const ain = inside(a), bin = inside(b);
      if (ain) next.push(a);
      if (ain !== bin) {
        const k = (value - a[axis]) / (b[axis] - a[axis]);
        next.push(axis === 0 ? [value, a[1] + (b[1] - a[1]) * k] : [a[0] + (b[0] - a[0]) * k, value]);
      }
    });
    out = next;
  };
  cut((p) => p[0] >= x1, 0, x1);
  cut((p) => p[0] <= x2, 0, x2);
  cut((p) => p[1] >= y1, 1, y1);
  cut((p) => p[1] <= y2, 1, y2);
  return out.length < 3 ? 0 : ringArea(out);
}

type Box = [number, number, number, number];
const boxOf = (f: Pick<Furniture, 'cx' | 'cy' | 'w' | 'd' | 'rot'>): Box => {
  const b = bbox(footprintCorners(f));
  return [b.x, b.y, b.x2, b.y2];
};

/** 家具的背靠方向：由 rot 反推（与 placeFurniture 的 ROT 表一致）。 */
export function sideOf(f: Pick<Furniture, 'rot'>): Side {
  const rot = ((Math.round(f.rot / 90) * 90) % 360 + 360) % 360;
  return rot === 0 ? 'up' : rot === 90 ? 'right' : rot === 180 ? 'down' : 'left';
}

/** 背面所在的线：side、线坐标、沿线范围。 */
function backFace(f: Pick<Furniture, 'cx' | 'cy' | 'w' | 'd' | 'rot'>): { side: Side; at: number; from: number; to: number } {
  const side = sideOf(f), [x1, y1, x2, y2] = boxOf(f);
  return side === 'up' ? { side, at: y1, from: x1, to: x2 }
    : side === 'down' ? { side, at: y2, from: x1, to: x2 }
    : side === 'left' ? { side, at: x1, from: y1, to: y2 }
    : { side, at: x2, from: y1, to: y2 };
}

/** 背面到某条同向边的净距：背面在边的室内一侧为正。 */
const gapTo = (side: Side, face: number, edge: number) => side === 'up' || side === 'left' ? face - edge : edge - face;

/** 背面某位置正后方（BACK_GAP 以内）的构造；没有靠着任何边时为 none。 */
function backingAt(edges: RoomEdge[], side: Side, at: number, t: number): SpanKind | 'none' {
  let best: RoomEdge | undefined, bestGap = Infinity;
  for (const e of edges) {
    if (e.side !== side || t < e.from || t > e.to) continue;
    const gap = gapTo(side, at, e.at);
    if (gap < -BACK_TOLERANCE || gap > BACK_GAP || gap >= bestGap) continue;
    best = e;
    bestGap = gap;
  }
  return best?.spans.find((s) => t >= s.from && t <= s.to)?.kind ?? 'none';
}

/** 背面被实墙覆盖的比例，以及非实墙部分里最多的构造（用于提示）。 */
export function backingOf(edges: RoomEdge[], f: Pick<Furniture, 'cx' | 'cy' | 'w' | 'd' | 'rot'>): { ratio: number; other: SpanKind | 'none' } {
  const face = backFace(f);
  const n = Math.max(2, Math.ceil((face.to - face.from) / SAMPLE));
  const counts = new Map<SpanKind | 'none', number>();
  let wall = 0;
  for (let k = 0; k < n; k++) {
    const kind = backingAt(edges, face.side, face.at, face.from + ((k + 0.5) * (face.to - face.from)) / n);
    if (kind === 'wall') wall++;
    else counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  const other = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'wall';
  return { ratio: wall / n, other };
}

export type ViolationKind = 'bounds' | 'backing' | KeepOutKind;
export interface Violation { kind: ViolationKind; other?: SpanKind | 'none' }

/** 单件家具违反的硬约束（彼此重叠与过道另算）。 */
export function violationsOf(f: Furniture, layout: RoomLayout): Violation[] {
  const out: Violation[] = [];
  if (!fitsInRoom(f, layout.room)) out.push({ kind: 'bounds' });
  const box = boxOf(f), tall = furnitureHeight(f) >= TALL;
  for (const keep of layout.keepOuts) {
    if (keep.kind === 'window' && !tall) continue;
    if (keep.kind === 'doorSweep' && f.type === 'rug') continue;
    if (out.some((v) => v.kind === keep.kind)) continue;
    if (clipArea(keep.poly, box) >= KEEP_OUT_AREA) out.push({ kind: keep.kind });
  }
  if (BACK_REQUIRED_TYPES.has(f.type)) {
    const { ratio, other } = backingOf(layout.edges, f);
    if (ratio < BACK_RATIO) out.push({ kind: 'backing', other });
  }
  return out;
}

/** 允许的正常重叠：地毯压家具、椅子收进桌下、灶台 / 水槽嵌在台面里。 */
const SEAT_TYPES = new Set(['chair', 'officechair', 'barstool']);
const TABLE_TYPES = new Set(['table', 'roundtable', 'coffeetable', 'desk', 'island', 'counter']);
const COUNTER_INSETS = new Set(['stove', 'ksink']);
const allowedOverlap = (a: Furniture, b: Furniture) =>
  a.type === 'rug' || b.type === 'rug' ||
  (SEAT_TYPES.has(a.type) && TABLE_TYPES.has(b.type)) || (TABLE_TYPES.has(a.type) && SEAT_TYPES.has(b.type)) ||
  (COUNTER_INSETS.has(a.type) && b.type === 'counter') || (a.type === 'counter' && COUNTER_INSETS.has(b.type)) ||
  // 电视放在电视柜上、壁挂在柜子上方，平面投影重叠是正常的。
  (a.type === 'tv' || b.type === 'tv' || a.type === 'acwall' || b.type === 'acwall' || a.type === 'waterheater' || b.type === 'waterheater');

/** 两件家具的平面投影是否可用「重叠」形容（超过 50mm 的实质性重叠，电视 / 壁挂空调类例外）。 */
export function overlaps(a: Furniture, b: Furniture): boolean {
  if (allowedOverlap(a, b)) return false;
  const p = boxOf(a), q = boxOf(b);
  return Math.min(p[2], q[2]) - Math.max(p[0], q[0]) > 50 && Math.min(p[3], q[3]) - Math.max(p[1], q[1]) > 50;
}

/** 某件家具放在 edge 上（沿边位置 t、离边 gap）后的新位置。 */
function placeOn(f: Furniture, edge: RoomEdge, t: number, gap: number): Furniture {
  const half = f.d / 2;
  const [cx, cy] = edge.side === 'up' ? [t, edge.at + gap + half]
    : edge.side === 'down' ? [t, edge.at - gap - half]
    : edge.side === 'left' ? [edge.at + gap + half, t]
    : [edge.at - gap - half, t];
  return { ...f, cx, cy, rot: ROT[edge.side] };
}

/** 家具当前离背后那条边的净距；没有同向的边时为 0。 */
function currentGap(f: Furniture, edges: RoomEdge[]): number {
  const face = backFace(f);
  const gaps = edges
    .filter((e) => e.side === face.side && Math.min(face.to, e.to) - Math.max(face.from, e.from) > 0)
    .map((e) => gapTo(face.side, face.at, e.at))
    .filter((g) => g >= -BACK_TOLERANCE);
  return gaps.length ? Math.max(0, Math.min(...gaps)) : 0;
}

/**
 * 最近的合法位置：沿各条边滑动（同一条边优先），保持原离墙距离或贴墙；
 * 必须整块在房间内、不压任何保留区、需要背靠的有实墙、不与其他家具穿插。
 */
function relocate(f: Furniture, layout: RoomLayout, others: Furniture[]): Furniture | null {
  const own = backFace(f);
  const gaps = BACK_REQUIRED_TYPES.has(f.type) ? [0] : [...new Set([Math.round(currentGap(f, layout.edges)), 0])];
  let best: { next: Furniture; cost: number } | null = null;
  for (const edge of layout.edges) {
    if (edge.to - edge.from < f.w) continue;
    const sameEdge = edge.side === own.side && Math.abs(gapTo(own.side, own.at, edge.at)) <= BACK_GAP + 600;
    for (const gap of gaps) {
      for (let t = edge.from + f.w / 2; t <= edge.to - f.w / 2 + 0.5; t += SAMPLE) {
        const next = placeOn(f, edge, t, gap);
        const cost = Math.hypot(next.cx - f.cx, next.cy - f.cy) + (sameEdge ? 0 : 600);
        if (best && cost >= best.cost) continue;
        if (violationsOf(next, layout).length || others.some((o) => overlaps(next, o))) continue;
        best = { next, cost };
      }
    }
  }
  return best?.next ?? null;
}

const ACTION: Record<ViolationKind, string> = {
  backing: '改靠实墙',
  doorSweep: '避开门扇开启范围',
  doorway: '让出门口通行区',
  window: '避开窗洞',
  bounds: '收回到房间内',
};

function problemOf(v: Violation): string {
  if (v.kind === 'backing') return `背后是${SPAN_LABEL[v.other ?? 'none']}，没有实墙可靠`;
  if (v.kind === 'doorSweep') return '压在门扇开启范围内';
  if (v.kind === 'doorway') return '挡住门口通行区';
  if (v.kind === 'window') return '挡住窗洞';
  return '超出了房间轮廓';
}

/**
 * 过道连通：在家具之外留出约 600 mm 见方的可走格子，看每个门口能否走进房间、门与门之间是否连通。
 * 没摆家具时门口本来就走不进去（过窄的房间）不算家具的问题。返回挡路的家具。
 */
export function passageBlocker(furniture: Furniture[], layout: RoomLayout): Furniture | null {
  const ring = layout.room.rings[0];
  if (!ring || layout.doors.length === 0) return null;
  const b = bbox(ring);
  const cols = Math.ceil((b.x2 - b.x) / GRID), rows = Math.ceil((b.y2 - b.y) / GRID);
  if (!cols || !rows || cols * rows > MAX_GRID_CELLS) return null;
  const at = (c: number, r: number): Point => [b.x + (c + 0.5) * GRID, b.y + (r + 0.5) * GRID];
  const inside = new Uint8Array(cols * rows), taken = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) inside[r * cols + c] = inRing(at(c, r), ring) ? 1 : 0;
  const blockers = furniture.filter((f) => f.type !== 'rug');
  for (const f of blockers) {
    const [x1, y1, x2, y2] = boxOf(f);
    for (let r = Math.max(0, Math.floor((y1 - b.y) / GRID)); r <= Math.min(rows - 1, Math.floor((y2 - b.y) / GRID)); r++)
      for (let c = Math.max(0, Math.floor((x1 - b.x) / GRID)); c <= Math.min(cols - 1, Math.floor((x2 - b.x) / GRID)); c++) {
        const [px, py] = at(c, r);
        if (px > x1 && px < x2 && py > y1 && py < y2) taken[r * cols + c] = 1;
      }
  }
  const walkable = (withFurniture: boolean) => {
    const out = new Uint8Array(cols * rows);
    for (let r = REACH; r < rows - REACH; r++) for (let c = REACH; c < cols - REACH; c++) {
      let ok = true;
      for (let dr = -REACH; dr <= REACH && ok; dr++) for (let dc = -REACH; dc <= REACH && ok; dc++) {
        const id = (r + dr) * cols + c + dc;
        if (!inside[id] || (withFurniture && taken[id])) ok = false;
      }
      out[r * cols + c] = ok ? 1 : 0;
    }
    return out;
  };
  const empty = walkable(false), real = walkable(true);
  /** 从门口直线走过去不碰家具（地毯除外）。 */
  const clearLine = (p: Point, q: Point, withFurniture: boolean) => {
    if (!withFurniture) return true;
    const steps = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 50));
    for (let k = 0; k <= steps; k++) {
      const x = p[0] + ((q[0] - p[0]) * k) / steps, y = p[1] + ((q[1] - p[1]) * k) / steps;
      const c = Math.floor((x - b.x) / GRID), r = Math.floor((y - b.y) / GRID);
      if (c >= 0 && r >= 0 && c < cols && r < rows && taken[r * cols + c]) return false;
    }
    return true;
  };
  /** 门口附近（约 700 mm 内）、能直线走到的最近可走格子。 */
  const seedOf = (grid: Uint8Array, p: Point) => {
    const found: { id: number; dist: number; at: Point }[] = [];
    const c0 = Math.floor((p[0] - b.x) / GRID), r0 = Math.floor((p[1] - b.y) / GRID);
    for (let r = r0 - 7; r <= r0 + 7; r++) for (let c = c0 - 7; c <= c0 + 7; c++) {
      if (r < 0 || c < 0 || r >= rows || c >= cols || !grid[r * cols + c]) continue;
      const q = at(c, r), dist = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (dist <= 700) found.push({ id: r * cols + c, dist, at: q });
    }
    found.sort((m, n) => m.dist - n.dist);
    return found.find((f) => clearLine(p, f.at, grid === real))?.id ?? -1;
  };
  const nearest = (p: Point) => blockers.reduce<{ f: Furniture | null; dist: number }>((m, f) => {
    const [x1, y1, x2, y2] = boxOf(f);
    const dist = Math.hypot(Math.max(x1 - p[0], 0, p[0] - x2), Math.max(y1 - p[1], 0, p[1] - y2));
    return dist < m.dist ? { f, dist } : m;
  }, { f: null, dist: Infinity }).f;
  const doors = layout.doors.filter((p) => seedOf(empty, p) >= 0);
  const seeds: number[] = [];
  for (const p of doors) {
    const seed = seedOf(real, p);
    if (seed < 0) return nearest(p);
    seeds.push(seed);
  }
  if (seeds.length < 2) return null;
  const seen = new Uint8Array(cols * rows), queue = [seeds[0]!];
  seen[seeds[0]!] = 1;
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head]!, c = id % cols, r = (id - c) / cols;
    for (const [nc, nr] of [[c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]]) {
      if (nc! < 0 || nr! < 0 || nc! >= cols || nr! >= rows) continue;
      const next = nr! * cols + nc!;
      if (seen[next] || !real[next]) continue;
      seen[next] = 1;
      queue.push(next);
    }
  }
  const cut = seeds.findIndex((s) => !seen[s]);
  if (cut < 0) return null;
  const a = doors[0]!, z = doors[cut]!;
  return nearest([(a[0] + z[0]) / 2, (a[1] + z[1]) / 2]);
}

export interface LayoutReport {
  /** 已自动微调的说明（家具名 + 动作）。 */
  adjusted: string[];
  /** 自动微调后仍存在、需要用户手动处理的问题。 */
  unresolved: string[];
}

export const reportCount = (report: LayoutReport) => report.adjusted.length + report.unresolved.length;

/**
 * 落库前的确定性校正：违反背靠面 / 保留区 / 房间轮廓的家具逐件挪到最近的合法位置
 * （沿边滑动 → 换边），合规的家具原样不动；找不到位置的保留原位并记为待手动处理。
 * 最后检查过道连通与家具穿插，只提示不改动。
 */
export function settleFurniture(furniture: Furniture[], layout: RoomLayout): { furniture: Furniture[]; report: LayoutReport } {
  const adjusted: string[] = [], unresolved: string[] = [];
  const out = [...furniture];
  out.forEach((f, i) => {
    const found = violationsOf(f, layout);
    if (!found.length) return;
    const others = out.filter((_, j) => j !== i);
    const next = relocate(f, layout, others);
    if (next) {
      out[i] = next;
      adjusted.push(`${f.name}：${ACTION[found[0]!.kind]}`);
    } else unresolved.push(`${f.name}：${problemOf(found[0]!)}，没有找到合适的位置，请手动调整`);
  });
  const blocker = passageBlocker(out, layout);
  if (blocker) unresolved.push(`${blocker.name}：挡住了门口到房间里的通道，请留出约 600 mm 宽的过道`);
  for (let i = 0; i < out.length && unresolved.length < 8; i++)
    for (let j = i + 1; j < out.length; j++)
      if (overlaps(out[i]!, out[j]!)) { unresolved.push(`${out[i]!.name} 与 ${out[j]!.name} 有重叠，请手动调整`); break; }
  return { furniture: out, report: { adjusted, unresolved } };
}

/** 发给模型的布局数据：相对分区左上角、取整，体积可控。 */
export function aiRoomGeometry(layout: RoomLayout, origin: Point) {
  const round = (n: number) => Math.round(n);
  const local = ([x, y]: Point): [number, number] => [round(x - origin[0]), round(y - origin[1])];
  const shift = (side: Side) => (isHorizontal(side) ? origin[0] : origin[1]);
  const across = (side: Side) => (isHorizontal(side) ? origin[1] : origin[0]);
  return {
    ring: (layout.room.rings[0] ?? []).map(local),
    edges: layout.edges.map((e) => ({
      side: e.side,
      at: round(e.at - across(e.side)),
      from: round(e.from - shift(e.side)),
      to: round(e.to - shift(e.side)),
      spans: e.spans.map((s) => ({ from: round(s.from - shift(e.side)), to: round(s.to - shift(e.side)), kind: s.kind })),
    })),
    keepOuts: layout.keepOuts.map((k) => ({ kind: k.kind, poly: k.poly.map(local) })),
    doors: layout.doors.map(local),
  };
}
