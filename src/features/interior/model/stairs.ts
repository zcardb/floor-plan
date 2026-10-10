import type { Furniture, LibraryItem, Point, StairForm, StairSpec } from './types';

/** 楼梯类别与默认参数（外框 w × d、梯段宽、踏步数，单位 mm / 级）。 */
export interface StairPreset { form: StairForm; name: string; w: number; d: number; flightWidth: number; steps: number }
export const STAIR_PRESETS: StairPreset[] = [
  { form: 'straight', name: '直跑楼梯', w: 1000, d: 3600, flightWidth: 1000, steps: 14 },
  { form: 'l', name: 'L 型楼梯', w: 2400, d: 2400, flightWidth: 900, steps: 15 },
  { form: 'u', name: 'U 型楼梯', w: 2100, d: 3000, flightWidth: 1000, steps: 16 },
  { form: 'triple', name: '三跑楼梯', w: 2700, d: 2700, flightWidth: 900, steps: 17 },
  { form: 'spiral', name: '螺旋楼梯', w: 1800, d: 1800, flightWidth: 800, steps: 14 },
];
export const STAIR_FORMS = STAIR_PRESETS.map(p => p.form);
export const STAIR_STEPS_MIN = 3, STAIR_STEPS_MAX = 40;
export const STAIR_FLIGHT_MIN = 300, STAIR_FLIGHT_MAX = 5000;
/** GB 50096 套内楼梯：梯段净宽 ≥ 0.75 m、踏步宽 ≥ 0.22 m、踏步高 ≤ 0.20 m；扇形踏步在距内侧扶手 0.25 m 处量踏步宽。 */
export const STAIR_RULES = { flightWidth: 750, treadDepth: 220, riserHeight: 200, spiralMeasureOffset: 250 };
const SPIRAL_SWEEP = (300 * Math.PI) / 180;

/** 楼梯在账号家具库与成本中归入「硬装 · 楼梯」，仍按件计价。按 type 判断，旧数据与账号副本同样适用。 */
export const STAIR_CATEGORY = '楼梯';
export const isStairs = (item: { type: string }) => item.type === 'stairs';
export const stairPreset = (form: StairForm) => STAIR_PRESETS.find(p => p.form === form)!;
export const stairCatalogId = (preset: StairPreset) => `stairs:${preset.name}`;
export const isStairForm = (form: unknown): form is StairForm => STAIR_FORMS.includes(form as StairForm);
export function validStairSpec(spec: unknown): boolean {
  if (!spec || typeof spec !== 'object') return false;
  const s = spec as StairSpec;
  const width = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= STAIR_FLIGHT_MIN && v <= STAIR_FLIGHT_MAX;
  return isStairForm(s.form) && Number.isInteger(s.steps) && s.steps >= STAIR_STEPS_MIN && s.steps <= STAIR_STEPS_MAX && width(s.flightWidth) &&
    (s.flightWidths === undefined || (Array.isArray(s.flightWidths) && s.flightWidths.length === stairFlightCount(s.form) && s.flightWidths.every(width))) &&
    (s.reverse === undefined || typeof s.reverse === 'boolean') && (s.hand === undefined || s.hand === 'left' || s.hand === 'right');
}
/** 旧楼梯没有 stair 字段：按直跑、梯段宽等于外框宽、12 级处理（与旧图样一致）。 */
export const stairSpec = (f: Pick<Furniture, 'w' | 'stair'>): StairSpec => f.stair ?? { form: 'straight', flightWidth: f.w, steps: 12 };

export const stairLibrary: LibraryItem[] = STAIR_PRESETS.map(p => ({
  catalogId: stairCatalogId(p), category: STAIR_CATEGORY, type: 'stairs', name: p.name, w: p.w, d: p.d, color: '#e6dccc',
  stair: { form: p.form, flightWidth: p.flightWidth, steps: p.steps },
}));

/** 切换类别：外框与参数换成该类别预设，位置与旋转保留；名称仍是预设名时一并换名，单价跟随类别。 */
export function applyStairForm(f: Furniture, form: StairForm): Furniture {
  const preset = stairPreset(form), presetNames = [...STAIR_PRESETS.map(p => p.name), '楼梯'];
  return {
    ...f, w: preset.w, d: preset.d, catalogId: stairCatalogId(preset),
    name: presetNames.includes(f.name) ? preset.name : f.name,
    stair: { form, flightWidth: preset.flightWidth, steps: preset.steps },
  };
}

export type StairOutline = { kind: 'rect' } | { kind: 'polygon'; points: Point[] } | { kind: 'circle'; r: number };
export interface StairLayout {
  outline: StairOutline;
  /** 螺旋楼梯中柱半径。 */
  column?: number;
  /** 踏步线、平台分界线、梯井边线。 */
  lines: [Point, Point][];
  /** 行走线（梯段中线），按上行方向排列。 */
  walk: Point[];
  arrow: Point[];
  start: Point;
  startRadius: number;
  label: Point;
  labelSize: number;
  breakLine: Point[];
  /** 实际使用的最窄梯段宽（已夹到外框能容纳的范围）。 */
  flightWidth: number;
  /** 最窄踏步宽（mm）。 */
  treadDepth: number;
}
/** 一跑梯段：中线起止点（按正向上行）、梯段宽、踏步宽。 */
interface Flight { start: Point; end: Point; width: number; tread: number }
type FlightLayout = Pick<StairLayout, 'outline' | 'lines' | 'walk'> & { flights: Flight[] };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const add = (p: Point, v: Point, k = 1): Point => [p[0] + v[0] * k, p[1] + v[1] * k];
function unit(a: Point, b: Point): Point {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
}
function arrowHead(from: Point, to: Point, size: number): Point[] {
  const u = unit(from, to), n: Point = [-u[1], u[0]], back = add(to, u, -size);
  return [add(back, n, size * 0.45), to, add(back, n, -size * 0.45)];
}
/** 折断线：一条斜线，中段带 Z 形折口。 */
function breakPolyline(a: Point, b: Point): Point[] {
  const u = unit(a, b), n: Point = [-u[1], u[0]], m: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const s = Math.min(Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.08, 70);
  return [a, add(m, u, -s), add(add(m, u, -s * 0.3), n, s), add(add(m, u, s * 0.3), n, -s), add(m, u, s), b];
}
/** 竖向梯段 x∈[x0, x0+fw]，从 yFrom 走到 yTo，n 级；返回内部踏步线。 */
function verticalTreads(x0: number, fw: number, yFrom: number, yTo: number, n: number): [Point, Point][] {
  const t = (yTo - yFrom) / n;
  return Array.from({ length: n - 1 }, (_, i) => [[x0, yFrom + t * (i + 1)], [x0 + fw, yFrom + t * (i + 1)]] as [Point, Point]);
}
function horizontalTreads(y0: number, fw: number, xFrom: number, xTo: number, n: number): [Point, Point][] {
  const t = (xTo - xFrom) / n;
  return Array.from({ length: n - 1 }, (_, i) => [[xFrom + t * (i + 1), y0], [xFrom + t * (i + 1), y0 + fw]] as [Point, Point]);
}
/** 第一跑上的起步点、「上」字（行走方向右手侧）与折断线（梯段中部斜向）。 */
function flightMarks({ start, end, width: fw, tread }: Flight) {
  const u = unit(start, end), n: Point = [-u[1], u[0]], run = Math.hypot(end[0] - start[0], end[1] - start[1]);
  const labelSize = clamp(Math.min(fw * 0.2, tread * 1.2), 100, 220), h = Math.min(fw * 0.6, run * 0.4), m = add(start, u, run * 0.5);
  return {
    start: add(start, u, tread / 2), startRadius: clamp(fw * 0.04, 20, 45),
    label: add(add(start, u, Math.max(tread, labelSize) * 0.9), n, fw * 0.28), labelSize,
    breakLine: breakPolyline(add(add(m, n, -fw / 2), u, -h / 2), add(add(m, n, fw / 2), u, h / 2)),
  };
}

export const stairFlightCount = (form: StairForm) => (form === 'triple' ? 3 : form === 'l' || form === 'u' ? 2 : 1);
/** 各跑梯段宽：有合法的 flightWidths 用它，否则每跑都用 flightWidth。 */
export function stairFlightWidths(spec: StairSpec): number[] {
  const count = stairFlightCount(spec.form);
  return spec.flightWidths?.length === count ? spec.flightWidths : Array<number>(count).fill(spec.flightWidth);
}
const multiFlight = (form: StairForm) => form === 'l' || form === 'u' || form === 'triple';

/** 正向、右转的梯段几何（局部坐标：外框中心为原点，起步在下方 +y，向 -y 上行）。 */
function flightLayout(spec: StairSpec, n: number, w: number, d: number): FlightLayout {
  const L = -w / 2, R = w / 2, T = -d / 2, B = d / 2, widths = stairFlightWidths(spec);
  if (spec.form === 'l') {
    const f1 = Math.min(widths[0], w * 0.6), f2 = Math.min(widths[1], d * 0.6), n1 = Math.ceil(n / 2), n2 = n - n1;
    const ly = T + f2, lx = L + f1, t1 = (B - ly) / n1, t2 = (R - lx) / n2;
    return {
      outline: { kind: 'polygon', points: [[L, B], [L, T], [R, T], [R, ly], [lx, ly], [lx, B]] },
      lines: [...verticalTreads(L, f1, B, ly, n1), [[L, ly], [lx, ly]], [[lx, T], [lx, ly]], ...horizontalTreads(T, f2, lx, R, n2)],
      walk: [[L + f1 / 2, B - t1 / 2], [L + f1 / 2, T + f2 / 2], [R - t2 / 2, T + f2 / 2]],
      flights: [{ start: [L + f1 / 2, B], end: [L + f1 / 2, ly], width: f1, tread: t1 }, { start: [lx, T + f2 / 2], end: [R, T + f2 / 2], width: f2, tread: t2 }],
    };
  }
  if (spec.form === 'u') {
    const k = Math.min(1, w / (widths[0] + widths[1]), (d * 0.5) / Math.max(widths[0], widths[1])), f1 = widths[0] * k, f2 = widths[1] * k;
    const ld = Math.max(f1, f2), ly = T + ld, n1 = Math.ceil(n / 2), n2 = n - n1, t1 = (B - ly) / n1, t2 = (B - ly) / n2;
    const well: [Point, Point][] = w - f1 - f2 > 1 ? [[[L + f1, ly], [L + f1, B]], [[R - f2, ly], [R - f2, B]]] : [[[L + f1, ly], [L + f1, B]]];
    return {
      outline: { kind: 'rect' },
      lines: [...verticalTreads(L, f1, B, ly, n1), [[L, ly], [L + f1, ly]], [[R - f2, ly], [R, ly]], ...well, ...verticalTreads(R - f2, f2, ly, B, n2)],
      walk: [[L + f1 / 2, B - t1 / 2], [L + f1 / 2, T + ld / 2], [R - f2 / 2, T + ld / 2], [R - f2 / 2, B - t2 / 2]],
      flights: [{ start: [L + f1 / 2, B], end: [L + f1 / 2, ly], width: f1, tread: t1 }, { start: [R - f2 / 2, ly], end: [R - f2 / 2, B], width: f2, tread: t2 }],
    };
  }
  if (spec.form === 'triple') {
    const k = Math.min(1, (w * 0.8) / (widths[0] + widths[2])), f1 = widths[0] * k, f3 = widths[2] * k, f2 = Math.min(widths[1], d * 0.6);
    const n1 = Math.ceil(n / 3), n2 = Math.ceil((n - n1) / 2), n3 = n - n1 - n2, ly = T + f2;
    const t1 = (B - ly) / n1, t2 = (w - f1 - f3) / n2, t3 = (B - ly) / n3;
    return {
      outline: { kind: 'polygon', points: [[L, B], [L, T], [R, T], [R, B], [R - f3, B], [R - f3, ly], [L + f1, ly], [L + f1, B]] },
      lines: [...verticalTreads(L, f1, B, ly, n1), [[L, ly], [L + f1, ly]], [[L + f1, T], [L + f1, ly]],
        ...horizontalTreads(T, f2, L + f1, R - f3, n2), [[R - f3, T], [R - f3, ly]], [[R - f3, ly], [R, ly]], ...verticalTreads(R - f3, f3, ly, B, n3)],
      walk: [[L + f1 / 2, B - t1 / 2], [L + f1 / 2, T + f2 / 2], [R - f3 / 2, T + f2 / 2], [R - f3 / 2, B - t3 / 2]],
      flights: [{ start: [L + f1 / 2, B], end: [L + f1 / 2, ly], width: f1, tread: t1 }, { start: [L + f1, T + f2 / 2], end: [R - f3, T + f2 / 2], width: f2, tread: t2 },
        { start: [R - f3 / 2, ly], end: [R - f3 / 2, B], width: f3, tread: t3 }],
    };
  }
  const fw = Math.min(spec.flightWidth, w), t = d / n, x0 = -fw / 2;
  return {
    outline: { kind: 'rect' },
    lines: [...verticalTreads(x0, fw, B, T, n), ...(fw < w - 1 ? [[[x0, T], [x0, B]], [[-x0, T], [-x0, B]]] as [Point, Point][] : [])],
    walk: [[0, B - t / 2], [0, T + t / 2]],
    flights: [{ start: [0, B], end: [0, T], width: fw, tread: t }],
  };
}

function spiralLayout(spec: StairSpec, n: number, w: number, d: number): StairLayout {
  const outer = Math.min(w, d) / 2, fw = Math.min(spec.flightWidth, outer * 0.85), inner = outer - fw, rm = (inner + outer) / 2;
  const step = SPIRAL_SWEEP / n, a0 = Math.PI / 2, polar = (r: number, a: number): Point => [r * Math.cos(a), r * Math.sin(a)];
  const lines = Array.from({ length: n + 1 }, (_, i) => [polar(inner, a0 + step * i), polar(outer, a0 + step * i)] as [Point, Point]);
  const from = a0 + step / 2, to = a0 + SPIRAL_SWEEP - step / 2, count = Math.max(8, Math.ceil((to - from) / (Math.PI / 36)));
  const forward = Array.from({ length: count + 1 }, (_, i) => polar(rm, from + (to - from) * i / count));
  const walk = spec.reverse ? forward.reverse() : forward, ab = a0 + SPIRAL_SWEEP * 0.45;
  return {
    outline: { kind: 'circle', r: outer }, column: inner, lines, walk,
    arrow: arrowHead(walk[walk.length - 2], walk[walk.length - 1], clamp(fw * 0.2, 60, 160)),
    start: walk[0], startRadius: clamp(fw * 0.05, 20, 40),
    label: polar(rm, a0 - (2 * Math.PI - SPIRAL_SWEEP) / 2), labelSize: clamp(fw * 0.22, 90, 200),
    breakLine: breakPolyline(polar(inner, ab - step * 0.4), polar(outer, ab + step * 0.4)),
    flightWidth: fw, treadDepth: (inner + STAIR_RULES.spiralMeasureOffset) * step,
  };
}

/** 楼梯平面几何（局部坐标：外框中心为原点）。反转只改行走方向与标记；左转直接镜像坐标（导出不用负比例图块）。 */
export function stairLayout(spec: StairSpec, w: number, d: number): StairLayout {
  const n = clamp(Math.round(spec.steps), STAIR_STEPS_MIN, STAIR_STEPS_MAX);
  if (spec.form === 'spiral') return spiralLayout(spec, n, w, d);
  const raw = flightLayout(spec, n, w, d), last = raw.flights[raw.flights.length - 1];
  const first: Flight = spec.reverse ? { ...last, start: last.end, end: last.start } : raw.flights[0];
  const walk = spec.reverse ? [...raw.walk].reverse() : raw.walk;
  const layout: StairLayout = {
    outline: raw.outline, lines: raw.lines, walk,
    arrow: arrowHead(walk[walk.length - 2], walk[walk.length - 1], clamp(first.width * 0.2, 60, 180)),
    ...flightMarks(first),
    flightWidth: Math.min(...raw.flights.map(f => f.width)), treadDepth: Math.min(...raw.flights.map(f => f.tread)),
  };
  if (spec.hand !== 'left' || !multiFlight(spec.form)) return layout;
  const m = ([x, y]: Point): Point => [-x, y];
  return {
    ...layout,
    outline: layout.outline.kind === 'polygon' ? { kind: 'polygon', points: layout.outline.points.map(m) } : layout.outline,
    lines: layout.lines.map(([a, b]) => [m(a), m(b)] as [Point, Point]),
    walk: layout.walk.map(m), arrow: layout.arrow.map(m), start: m(layout.start), label: m(layout.label), breakLine: layout.breakLine.map(m),
  };
}

export interface StairMetrics { flightWidth: number; treadDepth: number; riserHeight: number; warnings: string[] }
/** 推导踏步宽 / 踏步高，并按 GB 50096 套内楼梯给出提示（只提示不拦截）。 */
export function stairMetrics(spec: StairSpec, w: number, d: number, floorHeight: number): StairMetrics {
  const layout = stairLayout(spec, w, d), riserHeight = floorHeight / spec.steps, warnings: string[] = [];
  if (layout.flightWidth < STAIR_RULES.flightWidth) warnings.push('梯段宽小于 0.75 m，不满足套内楼梯最小净宽');
  if (layout.treadDepth < STAIR_RULES.treadDepth)
    warnings.push(spec.form === 'spiral' ? '距内侧 0.25 m 处踏步宽小于 0.22 m，可增大外框或减少踏步数' : '踏步宽小于 0.22 m，可加长外框或减少踏步数');
  if (riserHeight > STAIR_RULES.riserHeight) warnings.push('踏步高大于 0.20 m，可增加踏步数');
  return { flightWidth: layout.flightWidth, treadDepth: layout.treadDepth, riserHeight, warnings };
}
