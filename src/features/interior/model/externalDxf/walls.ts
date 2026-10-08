import { inRing, wallPoly } from '../geometry';
import type { Point, Wall } from '../types';
import {
  angleBucket, boundsOf, bucketNormal, cross, distance, dot, groupCollinear, intersectIntervals, midpoint, onAxis, projectRange,
  subtractIntervals, sub, wrapBucket, type AxisGroup, type Interval,
} from './vector';

/** 没有配上对的单线，按这个厚度当作单线墙。 */
export const SINGLE_WALL_THICKNESS = 120;
const MIN_FACE_GAP = 50, MAX_FACE_GAP = 600;
const MIN_LINE = 50, MIN_PIECE = 100, MIN_SINGLE = 500;
const PARALLEL = 0.035;

export interface WallPiece { a: Point; b: Point; thickness: number }
/** 一条墙面线：轴向 u、法向 n、法向偏移 c，range 为沿轴区间，used 为已配成墙的部分。 */
interface FaceLine { u: Point; n: Point; c: number; range: Interval; used: Interval[] }
interface FacePair { i: FaceLine; j: FaceLine; d: number; overlap: Interval }

const pointAt = (line: FaceLine, t: number) => onAxis(line.u, line.n, t, line.c);
const inFrame = (line: FaceLine, r: Interval, u: Point) => projectRange(pointAt(line, r[0]), pointAt(line, r[1]), u);
const span = (r: Interval) => r[1] - r[0];

function facePair(i: FaceLine, j: FaceLine): FacePair | undefined {
  if (Math.abs(cross(i.u, j.u)) > PARALLEL) return undefined;
  const ja = pointAt(j, j.range[0]), jb = pointAt(j, j.range[1]);
  const da = dot(ja, i.n) - i.c, db = dot(jb, i.n) - i.c;
  if (Math.abs(da - db) > 20) return undefined;
  const d = (da + db) / 2, gap = Math.abs(d);
  if (gap < MIN_FACE_GAP || gap > MAX_FACE_GAP) return undefined;
  const rj = projectRange(ja, jb, i.u);
  const overlap: Interval = [Math.max(i.range[0], rj[0]), Math.min(i.range[1], rj[1])];
  return span(overlap) < Math.max(MIN_PIECE, gap * 0.8) ? undefined : { i, j, d, overlap };
}

/** 只在相邻角度桶、法向距离够近的线之间找候选，避免两两比较整张图。 */
function candidatePairs(lines: FaceLine[]): FacePair[] {
  const buckets = new Map<number, FaceLine[]>();
  for (const line of lines) {
    const key = angleBucket(line.u);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(line);
  }
  const box = boundsOf(lines.flatMap(l => [pointAt(l, l.range[0]), pointAt(l, l.range[1])]));
  const extent = Math.max(box.x2 - box.x, box.y2 - box.y);
  const reach = MAX_FACE_GAP + extent * 0.04 + 10;
  const pairs: FacePair[] = [];
  for (const [deg, own] of buckets) {
    const next = wrapBucket(deg + 1), n = bucketNormal(deg);
    const entries = [...own.map(line => ({ line, own: true })), ...(next === deg ? [] : buckets.get(next) ?? []).map(line => ({ line, own: false }))]
      .map(e => ({ ...e, key: dot(pointAt(e.line, (e.line.range[0] + e.line.range[1]) / 2), n) }))
      .sort((x, y) => x.key - y.key);
    for (let p = 0; p < entries.length; p++)
      for (let q = p + 1; q < entries.length && entries[q].key - entries[p].key <= reach; q++) {
        if (!entries[p].own && !entries[q].own) continue;
        const pair = facePair(entries[p].line, entries[q].line);
        if (pair) pairs.push(pair);
      }
  }
  return pairs;
}

/** 整段落在更长墙段内部的碎片（重叠画法、接头处的误配）丢掉；只是端头伸进别的墙里的保留。 */
function dropNested(pieces: WallPiece[]): WallPiece[] {
  const kept: { piece: WallPiece; poly: Point[] }[] = [];
  for (const piece of pieces.slice().sort((x, y) => distance(y.a, y.b) - distance(x.a, x.b))) {
    if (kept.some(k => inRing(piece.a, k.poly) && inRing(piece.b, k.poly))) continue;
    kept.push({ piece, poly: wallPoly({ ...piece, thickness: piece.thickness + 10 } as Wall, 5) });
  }
  return kept.map(k => k.piece);
}

/**
 * 墙线 → 墙轴线。
 * 1. 共线重叠的线先并成一条墙面线；
 * 2. 平行、间距 50–600 mm、有足够重叠的两条墙面线配成一面墙，又长又近的先配，已用过的区间不再参与；
 * 3. 剩下够长的单线按单线墙处理；
 * 4. 共线、同厚度、间距不超过一个墙厚的墙段并成一面墙（T 形接头处一侧墙面被打断）。
 */
export function wallAxes(segments: { a: Point; b: Point }[]): { axes: AxisGroup[]; singles: number } {
  const lines: FaceLine[] = groupCollinear(segments.map(s => ({ ...s, thickness: 0 })), 1, () => 1)
    .flatMap(g => g.runs.filter(r => span(r) >= MIN_LINE).map(range => ({ u: g.u, n: g.n, c: g.c, range, used: [] })));
  if (!lines.length) return { axes: [], singles: 0 };
  const pieces: WallPiece[] = [];
  // 「重叠长度 ÷ 间距」越大越像一面真墙：长墙先配，墙端的短封口线轮到时两侧墙面已被用掉，不会配出碎墙。
  const score = (pair: FacePair) => span(pair.overlap) / Math.abs(pair.d);
  const pairs = candidatePairs(lines).sort((x, y) => score(y) - score(x) || Math.abs(x.d) - Math.abs(y.d));
  for (const { i, j, d, overlap } of pairs) {
    const free = intersectIntervals(subtractIntervals(overlap, i.used), subtractIntervals(overlap, j.used.map(r => inFrame(j, r, i.u))));
    for (const run of free) {
      if (span(run) < MIN_PIECE) continue;
      const thickness = Math.min(1000, Math.max(50, Math.round(Math.abs(d) / 10) * 10));
      pieces.push({ a: onAxis(i.u, i.n, run[0], i.c + d / 2), b: onAxis(i.u, i.n, run[1], i.c + d / 2), thickness });
      i.used.push(run);
      j.used.push(projectRange(pointAt(i, run[0]), pointAt(i, run[1]), j.u));
    }
  }
  let singles = 0;
  for (const line of lines)
    for (const run of subtractIntervals(line.range, line.used)) {
      if (span(run) < MIN_SINGLE) continue;
      pieces.push({ a: pointAt(line, run[0]), b: pointAt(line, run[1]), thickness: SINGLE_WALL_THICKNESS });
      singles++;
    }
  return { axes: regroupAxes(dropNested(pieces)), singles };
}

/** 共线、同厚度、间距不超过一个墙厚的墙段并成一条轴线。 */
export const regroupAxes = (pieces: WallPiece[]) => groupCollinear(pieces, 10, g => g.thickness + 30);

export const axisWalls = (axes: AxisGroup[]): WallPiece[] =>
  axes.flatMap(g => g.runs.map(([s, e]) => ({ a: onAxis(g.u, g.n, s, g.c), b: onAxis(g.u, g.n, e, g.c), thickness: g.thickness })));

/**
 * 让墙端延伸到相邻墙的轴线上：双线图里墙段只画到对方墙面，L 形和 T 形接头处差半个墙厚。
 * 每个端点都按延伸前的几何求交，结果与处理顺序无关。
 */
export function closeJoints(walls: WallPiece[]): WallPiece[] {
  const extend = (wall: WallPiece, end: Point, from: Point): Point => {
    const L = distance(from, end), out: Point = [(end[0] - from[0]) / L, (end[1] - from[1]) / L];
    let best: { s: number; p: Point } | undefined;
    for (const other of walls) {
      if (other === wall) continue;
      const length = distance(other.a, other.b), ou: Point = [(other.b[0] - other.a[0]) / length, (other.b[1] - other.a[1]) / length];
      const denominator = cross(out, ou);
      if (Math.abs(denominator) < 0.34) continue;
      const diff = sub(other.a, end), s = cross(diff, ou) / denominator, t = cross(diff, out) / denominator;
      const slack = wall.thickness / 2 + 30;
      if (s < -1 || s > other.thickness + 30 || t < -slack || t > length + slack) continue;
      if (!best || Math.abs(s) < Math.abs(best.s)) best = { s, p: [end[0] + out[0] * s, end[1] + out[1] * s] };
    }
    return best ? best.p : end;
  };
  return walls.map(w => ({ ...w, a: extend(w, w.a, w.b), b: extend(w, w.b, w.a) }));
}
