import { inRing, wallPoly } from '../geometry';
import type { Opening, Point, Wall } from '../types';
import { uid } from '../types';
import { boundsOf, cross, distance, dot, groupCollinear, normalOf, onAxis, sub, type AxisGroup, type Interval } from './vector';
import type { WallPiece } from './walls';

const MIN_OPENING = 300, MAX_OPENING = 6000, MAX_BAND = 700;
/** 门窗符号贴墙的容差：沿墙方向 30 mm，垂直方向超出墙面 60 mm。 */
const ALONG_SLACK = 30, FACE_SLACK = 60;

export interface SymbolSegment { a: Point; b: Point; group?: number; arc?: boolean; kind: 'door' | 'window' | 'auto' }
/** 一个门或窗的图形：连在一起的线，或同一个小图块。 */
export interface SymbolCluster { kind: 'door' | 'window'; points: Point[]; lines: [Point, Point][]; used: boolean }
export interface FoundOpening { kind: 'door' | 'window'; center: Point; width: number; points: Point[] }

/** 按端点相连（5 mm 内）或同属一个不超过 3 m 的图块，把门窗线聚成一个个符号。 */
export function clusterSymbols(segments: SymbolSegment[]): SymbolCluster[] {
  const parent = segments.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (i: number, j: number) => { parent[find(i)] = find(j); };
  const byPoint = new Map<string, number>(), byGroup = new Map<number, number[]>();
  segments.forEach((s, i) => {
    for (const p of [s.a, s.b]) {
      const key = Math.round(p[0] / 5) + ':' + Math.round(p[1] / 5);
      const seen = byPoint.get(key);
      if (seen === undefined) byPoint.set(key, i); else union(i, seen);
    }
    if (s.group !== undefined) byGroup.set(s.group, [...(byGroup.get(s.group) ?? []), i]);
  });
  for (const members of byGroup.values()) {
    const points = members.flatMap(i => [segments[i].a, segments[i].b]);
    const box = boundsOf(points), size = Math.hypot(box.x2 - box.x, box.y2 - box.y);
    // 整张图被做成一个大图块时不能当成一个门窗。
    if (size <= 3000) members.forEach(i => union(i, members[0]));
  }
  const clusters = new Map<number, { segments: SymbolSegment[] }>();
  segments.forEach((s, i) => {
    const root = find(i);
    if (!clusters.has(root)) clusters.set(root, { segments: [] });
    clusters.get(root)!.segments.push(s);
  });
  return mergeOverlapping([...clusters.values()].map(c => c.segments)).map(list => {
    const explicit = list.find(s => s.kind !== 'auto')?.kind as 'door' | 'window' | undefined;
    // 自动区分：带开启弧线的是门，否则是窗。
    return {
      kind: explicit ?? (list.some(s => s.arc) ? 'door' : 'window'),
      points: list.flatMap(s => [s.a, s.b]), lines: list.map(s => [s.a, s.b] as [Point, Point]), used: false,
    };
  });
}

/**
 * 窗的中线（玻璃线）通常不和外框端点相连：没有开启弧线、且包围盒落在另一个窗框里的符号并进去。
 * 门不参与合并，免得把门边的窗吞成一扇门。
 */
function mergeOverlapping(groups: SymbolSegment[][]): SymbolSegment[][] {
  type Box = ReturnType<typeof boundsOf>;
  const items = groups.map(list => ({ list, box: boundsOf(list.flatMap(s => [s.a, s.b])), door: list.some(s => s.arc || s.kind === 'door') }));
  const inside = (p: Box, q: Box) => p.x >= q.x - 5 && p.x2 <= q.x2 + 5 && p.y >= q.y - 5 && p.y2 <= q.y2 + 5;
  // 大图纸上符号很多时跳过，避免平方级比较。
  if (items.length > 3000) return groups;
  const host = items.map(() => -1);
  items.forEach((item, i) => {
    if (item.door) return;
    let best = -1;
    items.forEach((other, j) => {
      if (j === i || other.door || !inside(item.box, other.box)) return;
      // 互相包含（同样大小）时只并到下标小的一边，避免成环。
      if (inside(other.box, item.box) && j > i) return;
      if (best < 0 || (other.box.x2 - other.box.x) * (other.box.y2 - other.box.y) < (items[best].box.x2 - items[best].box.x) * (items[best].box.y2 - items[best].box.y)) best = j;
    });
    host[i] = best;
  });
  const root = (i: number): number => { let k = i, guard = 0; while (host[k] >= 0 && guard++ < items.length) k = host[k]; return k; };
  const merged = new Map<number, SymbolSegment[]>();
  items.forEach((item, i) => { const r = root(i); merged.set(r, [...(merged.get(r) ?? []), ...item.list]); });
  return [...merged.values()];
}

type Take = (g: AxisGroup, start: number, end: number) => boolean;
/**
 * 缺口 [start, end] 里的门窗符号：沿墙范围盖住缺口一半以上、不比缺口大太多，
 * 垂直墙的范围不超过门扇长度或凸窗进深，且缺口内至少有一点贴在墙面上（凸窗、门扇伸出墙外也算）。
 */
function gapTaker(clusters: SymbolCluster[], found: FoundOpening[]): Take {
  return (g, start, end) => {
    const width = end - start;
    if (width < MIN_OPENING || width > MAX_OPENING) return false;
    const touching = clusters.filter(c => {
      if (c.used) return false;
      const along = c.points.map(p => dot(p, g.u)), lo = Math.min(...along), hi = Math.max(...along);
      const across = c.points.map(p => dot(p, g.n)), depth = Math.max(...across) - Math.min(...across);
      return Math.min(hi, end) - Math.max(lo, start) >= width * 0.5 && hi - lo <= width * 1.5 + 200 &&
        depth <= Math.max(width * 1.2, g.thickness + 1200) &&
        c.points.some(p => {
          const t = dot(p, g.u);
          return t >= start - ALONG_SLACK && t <= end + ALONG_SLACK && Math.abs(dot(p, g.n) - g.c) <= g.thickness / 2 + FACE_SLACK;
        });
    });
    if (!touching.length) return false;
    for (const c of touching) c.used = true;
    found.push({
      kind: touching.some(c => c.kind === 'door') ? 'door' : 'window',
      center: onAxis(g.u, g.n, (start + end) / 2, g.c), width, points: touching.flatMap(c => c.points),
    });
    return true;
  };
}

/** 墙线在门窗处断开：同一轴线上两段墙之间的缺口里有门窗符号，就把两段墙并成一面，并在缺口处放开口。 */
export function fillCollinearGaps(axes: AxisGroup[], clusters: SymbolCluster[]): FoundOpening[] {
  const found: FoundOpening[] = [], take = gapTaker(clusters, found);
  for (const g of axes) {
    let i = 0;
    while (i + 1 < g.runs.length) {
      if (take(g, g.runs[i][1], g.runs[i + 1][0])) g.runs.splice(i, 2, [g.runs[i][0], g.runs[i + 1][1]]);
      else i++;
    }
  }
  return found;
}

/** 门开在墙角处：墙端到相邻横墙墙面之间的缺口里有门窗符号，墙段延伸到横墙轴线。 */
export function fillEndGaps(axes: AxisGroup[], clusters: SymbolCluster[]): FoundOpening[] {
  const found: FoundOpening[] = [], take = gapTaker(clusters, found);
  for (const g of axes)
    for (const run of g.runs)
      for (const side of [0, 1] as const) {
        const reach = crossingAhead(axes, g, run, side);
        if (!reach) continue;
        const [start, end] = side === 1 ? [run[1], reach.face] : [reach.face, run[0]];
        if (take(g, start, end)) run[side] = reach.axis;
      }
  return found;
}

/** 从墙段一端沿轴线向外，最近的那面横墙：返回它的轴线位置和近侧墙面位置（都是本轴线上的坐标）。 */
function crossingAhead(axes: AxisGroup[], g: AxisGroup, run: Interval, side: 0 | 1) {
  const sign = side === 1 ? 1 : -1, from = run[side];
  let best: { axis: number; face: number } | undefined;
  for (const h of axes) {
    const denominator = cross(g.u, h.u);
    if (h === g || Math.abs(denominator) < 0.34) continue;
    // 本轴线上 t 处的点落在 h 轴线上：dot(onAxis(g, t), h.n) = h.c。
    const t = (h.c - g.c * dot(g.n, h.n)) / dot(g.u, h.n);
    const ahead = (t - from) * sign;
    if (ahead <= 0 || ahead > MAX_OPENING + h.thickness) continue;
    const along = dot(onAxis(g.u, g.n, t, g.c), h.u), slack = g.thickness / 2 + 30;
    if (!h.runs.some(([s, e]) => along >= s - slack && along <= e + slack)) continue;
    if (g.runs.some(r => r !== run && (r[0] - from) * sign > 0 && (r[0] - t) * sign < 0)) continue;
    const face = t - (sign * h.thickness) / 2 / Math.abs(denominator);
    if (!best || Math.abs(t - from) < Math.abs(best.axis - from)) best = { axis: t, face };
  }
  return best;
}

/**
 * 整面墙都画成窗（阳台窗、落地窗带）时图纸上没有墙线：把一组平行、互相重叠的窗线
 * （外框两条长边加中间的玻璃线）当成一面墙，墙厚取这组线的总宽，整段放一个窗。
 */
export function windowBands(clusters: SymbolCluster[], existing: WallPiece[]): { walls: WallPiece[]; found: FoundOpening[] } {
  const existingPolys = existing.map(w => wallPoly({ ...w, thickness: w.thickness + 20 } as Wall, 10));
  const walls: WallPiece[] = [], found: FoundOpening[] = [];
  for (const cluster of clusters) {
    if (cluster.used || cluster.kind !== 'window') continue;
    const lines = groupCollinear(cluster.lines.map(([a, b]) => ({ a, b, thickness: 0 })), 2, () => 2)
      .flatMap(g => g.runs.filter(r => r[1] - r[0] >= MIN_OPENING).map(run => ({ g, run, taken: false })))
      .sort((x, y) => (y.run[1] - y.run[0]) - (x.run[1] - x.run[0]));
    for (const base of lines) {
      if (base.taken) continue;
      const stack = lines.filter(l => !l.taken && Math.abs(cross(l.g.u, base.g.u)) < 0.0175 && Math.abs(l.g.c - base.g.c) <= MAX_BAND &&
        Math.min(l.run[1], base.run[1]) - Math.max(l.run[0], base.run[0]) >= 0.8 * Math.min(l.run[1] - l.run[0], base.run[1] - base.run[0]));
      const offsets = stack.map(l => l.g.c), lo = Math.min(...offsets), hi = Math.max(...offsets), thickness = Math.round((hi - lo) / 10) * 10;
      if (stack.length < 2 || thickness < 50 || thickness > MAX_BAND) continue;
      for (const l of stack) l.taken = true;
      const { u, n } = base.g, [s, e] = base.run, c = (lo + hi) / 2;
      // 窗画在完整的墙里（墙线没断开）：交给 attachLoose 挂到那面墙上。
      if (existingPolys.some(poly => inRing(onAxis(u, n, (s + e) / 2, c), poly))) continue;
      walls.push({ a: onAxis(u, n, s, c), b: onAxis(u, n, e, c), thickness });
      found.push({ kind: 'window', center: onAxis(u, n, (s + e) / 2, c), width: e - s, points: [] });
      cluster.used = true;
    }
  }
  return { walls, found };
}

const frame = (wall: WallPiece) => {
  const L = distance(wall.a, wall.b), u: Point = [(wall.b[0] - wall.a[0]) / L, (wall.b[1] - wall.a[1]) / L];
  return { L, u, n: normalOf(u) };
};

/** 没落在缺口里的门窗符号（墙线没断开的画法）：挂到贴得最紧的那面墙上，宽度取贴墙部分沿墙的范围。 */
export function attachLoose(walls: WallPiece[], clusters: SymbolCluster[]): FoundOpening[] {
  const found: FoundOpening[] = [];
  for (const cluster of clusters) {
    if (cluster.used) continue;
    let best: { count: number; lo: number; hi: number; wall: WallPiece } | undefined;
    for (const wall of walls) {
      const { L, u, n } = frame(wall);
      const along = cluster.points
        .filter(p => Math.abs(dot(sub(p, wall.a), n)) <= wall.thickness / 2 + FACE_SLACK)
        .map(p => dot(sub(p, wall.a), u))
        .filter(t => t >= -ALONG_SLACK && t <= L + ALONG_SLACK);
      if (along.length >= 2 && (!best || along.length > best.count))
        best = { count: along.length, lo: Math.max(0, Math.min(...along)), hi: Math.min(L, Math.max(...along)), wall };
    }
    if (!best || best.hi - best.lo < MIN_OPENING || best.hi - best.lo > MAX_OPENING) continue;
    cluster.used = true;
    const { u } = frame(best.wall), t = (best.lo + best.hi) / 2;
    found.push({ kind: cluster.kind, center: [best.wall.a[0] + u[0] * t, best.wall.a[1] + u[1] * t], width: best.hi - best.lo, points: cluster.points });
  }
  return found;
}

/**
 * 把识别到的开口落到最终的墙上。放不下（超出墙长、和别的开口重叠、找不到墙）的丢弃并计数。
 * 门的开向取离墙最远的那个点（门扇尖端）：它靠近哪一端就是铰链端，在墙的哪一侧就朝哪边开。
 */
export function placeOpenings(walls: Wall[], found: FoundOpening[]): { openings: Opening[]; dropped: number } {
  const openings: Opening[] = [];
  let dropped = 0;
  for (const item of found) {
    const host = walls
      .map(wall => { const { L, u, n } = frame(wall); return { wall, L, u, n, t: dot(sub(item.center, wall.a), u), off: Math.abs(dot(sub(item.center, wall.a), n)) }; })
      .filter(h => h.off <= 5 && h.t >= 0 && h.t <= h.L)
      .sort((x, y) => x.off - y.off)[0];
    const width = Math.round(item.width);
    if (!host) { dropped++; continue; }
    const offset = Math.min(host.L - width / 2, Math.max(width / 2, host.t));
    if (width > host.L || openings.some(o => o.wallId === host.wall.id && Math.abs(o.offset - offset) < (o.width + width) / 2)) { dropped++; continue; }
    const opening: Opening = { id: uid(), wallId: host.wall.id, kind: item.kind, offset, width, open: true };
    if (item.kind === 'door') {
      const tip = item.points
        .map(p => ({ along: dot(sub(p, host.wall.a), host.u) - offset, side: dot(sub(p, host.wall.a), host.n) }))
        .sort((x, y) => Math.abs(y.side) - Math.abs(x.side))[0];
      if (tip && Math.abs(tip.side) > width / 2) { opening.hinge = tip.along < 0 ? 'start' : 'end'; opening.swingSide = tip.side > 0 ? 1 : -1; }
    }
    openings.push(opening);
  }
  return { openings, dropped };
}
