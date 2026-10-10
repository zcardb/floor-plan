import type { Design, Furniture, LibraryItem, Point, StairForm, StairSpec } from './types';

function clamp(v: number, min: number, max: number) { return Math.min(max, Math.max(min, v)); }

/** 楼梯类别与默认参数（梯段宽 mm、预设踏步数）。外框由梯段长推导，见 stairSizeOf。 */
export interface StairPreset { form: StairForm; name: string; flightWidth: number; steps: number }
export const STAIR_PRESETS: StairPreset[] = [
  { form: 'straight', name: '直跑楼梯', flightWidth: 1000, steps: 16 },
  { form: 'l', name: 'L 型楼梯', flightWidth: 900, steps: 16 },
  { form: 'u', name: 'U 型楼梯', flightWidth: 1000, steps: 16 },
  { form: 'triple', name: '三跑楼梯', flightWidth: 900, steps: 16 },
  { form: 'spiral', name: '螺旋楼梯', flightWidth: 800, steps: 16 },
];
export const STAIR_FORMS = STAIR_PRESETS.map(p => p.form);
export const STAIR_STEPS_MIN = 3, STAIR_STEPS_MAX = 40;
export const STAIR_FLIGHT_MIN = 300, STAIR_FLIGHT_MAX = 5000;
export const STAIR_LENGTH_MIN = 300, STAIR_LENGTH_MAX = 20000;
export const STAIR_TREAD_MIN = 150, STAIR_TREAD_MAX = 400;
export const STAIR_RISER_MIN = 100, STAIR_RISER_MAX = 250;
/** 住宅套内常用值：踏步高 175 mm（150–175 舒适区）、踏面宽 280 mm（260–300 常用区）。 */
export const STAIR_DEFAULTS = { riserHeight: 175, treadDepth: 280 };
/**
 * 梯井：U 型（双跑）楼梯两跑梯段之间的竖向空档，平面上夹在左右两跑中间。
 * GB 50096：梯井净宽大于 0.11 m 时须采取防止儿童攀滑的措施；住宅常取 0.10–0.20 m，默认 0.20 m。
 */
export const STAIR_WELL_GAP = 200;
export const STAIR_WELL_MIN = 0, STAIR_WELL_MAX = 1000;
/** GB 50096 套内楼梯：梯段净宽 ≥ 0.75 m、踏步宽 ≥ 0.22 m、踏步高 ≤ 0.20 m；扇形踏步在距内侧扶手 0.25 m 处量踏步宽。 */
export const STAIR_RULES = { flightWidth: 750, treadDepth: 220, riserHeight: 200, spiralMeasureOffset: 250 };
const SPIRAL_SWEEP = (300 * Math.PI) / 180;

/** 楼梯在账号家具库与成本中归入「硬装 · 楼梯」，仍按件计价。按 type 判断，旧数据与账号副本同样适用。 */
export const STAIR_CATEGORY = '楼梯';
export function isStairs(item: { type: string }) { return item.type === 'stairs'; }
export function stairPreset(form: StairForm) { return STAIR_PRESETS.find(p => p.form === form)!; }
export function stairCatalogId(preset: StairPreset) { return `stairs:${preset.name}`; }
export function isStairForm(form: unknown): form is StairForm { return STAIR_FORMS.includes(form as StairForm); }
export function stairFlightCount(form: StairForm) { return form === 'triple' ? 3 : form === 'l' || form === 'u' ? 2 : 1; }
const multiFlight = (form: StairForm) => stairFlightCount(form) > 1;
export function stairRiser(spec: StairSpec) { return spec.riserHeight ?? STAIR_DEFAULTS.riserHeight; }
export function stairTread(spec: StairSpec) { return spec.treadDepth ?? STAIR_DEFAULTS.treadDepth; }
export function stairWell(spec: StairSpec) { return spec.form === 'u' ? spec.wellGap ?? STAIR_WELL_GAP : 0; }
/** 踏步数 = 层高 ÷ 踏步高，取整并夹到 3–40 级。 */
export function stairSteps(floorHeight: number, riser: number = STAIR_DEFAULTS.riserHeight) {
  return clamp(Math.round(floorHeight / Math.max(riser, STAIR_RISER_MIN)), STAIR_STEPS_MIN, STAIR_STEPS_MAX);
}
/** 各跑踏步数：两跑先多后少，三跑约三等分。 */
export function stairFlightSteps(form: StairForm, steps: number): number[] {
  const n = clamp(Math.round(steps), STAIR_STEPS_MIN, STAIR_STEPS_MAX);
  if (form === 'l' || form === 'u') return [Math.ceil(n / 2), n - Math.ceil(n / 2)];
  if (form === 'triple') { const n1 = Math.ceil(n / 3), n2 = Math.ceil((n - n1) / 2); return [n1, n2, n - n1 - n2]; }
  return [n];
}
/** 各跑梯段宽：有合法的 flightWidths 用它，否则每跑都用 flightWidth。 */
export function stairFlightWidths(spec: StairSpec): number[] {
  const count = stairFlightCount(spec.form);
  return spec.flightWidths?.length === count ? spec.flightWidths : Array<number>(count).fill(spec.flightWidth);
}
/** 行业标准梯段长 = 该跑踏步数 × 踏面宽；螺旋楼梯没有梯段长。 */
export function stairStandardLengths(spec: StairSpec): number[] {
  return spec.form === 'spiral' ? [] : stairFlightSteps(spec.form, spec.steps).map(n => n * stairTread(spec));
}

export function validStairSpec(spec: unknown): boolean {
  if (!spec || typeof spec !== 'object') return false;
  const s = spec as StairSpec;
  const range = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
  const width = (v: unknown) => range(v, STAIR_FLIGHT_MIN, STAIR_FLIGHT_MAX), run = (v: unknown) => range(v, STAIR_LENGTH_MIN, STAIR_LENGTH_MAX);
  const perFlight = (v: unknown, check: (x: unknown) => boolean) =>
    v === undefined || (Array.isArray(v) && v.length === stairFlightCount(s.form) && v.every(check));
  return isStairForm(s.form) && Number.isInteger(s.steps) && s.steps >= STAIR_STEPS_MIN && s.steps <= STAIR_STEPS_MAX && width(s.flightWidth) &&
    perFlight(s.flightWidths, width) && (s.form !== 'spiral' ? perFlight(s.flightLengths, run) : s.flightLengths === undefined) &&
    (s.treadDepth === undefined || range(s.treadDepth, STAIR_TREAD_MIN, STAIR_TREAD_MAX)) &&
    (s.riserHeight === undefined || range(s.riserHeight, STAIR_RISER_MIN, STAIR_RISER_MAX)) &&
    (s.stepsManual === undefined || typeof s.stepsManual === 'boolean') &&
    (s.wellGap === undefined || (s.form === 'u' && range(s.wellGap, STAIR_WELL_MIN, STAIR_WELL_MAX))) &&
    (s.reverse === undefined || typeof s.reverse === 'boolean') && (s.hand === undefined || s.hand === 'left' || s.hand === 'right');
}
/** 旧楼梯没有 stair 字段：按直跑、梯段宽等于外框宽、12 级处理（与旧图样一致）。 */
export function stairSpec(f: Pick<Furniture, 'w' | 'stair'>): StairSpec { return f.stair ?? { form: 'straight', flightWidth: f.w, steps: 12 }; }

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

const add = (p: Point, v: Point, k = 1): Point => [p[0] + v[0] * k, p[1] + v[1] * k];
const dist = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1]);
function unit(a: Point, b: Point): Point {
  const L = dist(a, b) || 1;
  return [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
}
function arrowHead(from: Point, to: Point, size: number): Point[] {
  const u = unit(from, to), n: Point = [-u[1], u[0]], back = add(to, u, -size);
  return [add(back, n, size * 0.45), to, add(back, n, -size * 0.45)];
}
/** 折断线：一条斜线，中段带 Z 形折口。 */
function breakPolyline(a: Point, b: Point): Point[] {
  const u = unit(a, b), n: Point = [-u[1], u[0]], m: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const s = Math.min(dist(a, b) * 0.08, 70);
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
  const u = unit(start, end), n: Point = [-u[1], u[0]], run = dist(start, end);
  const labelSize = clamp(Math.min(fw * 0.2, tread * 1.2), 100, 220), h = Math.min(fw * 0.6, run * 0.4), m = add(start, u, run * 0.5);
  return {
    start: add(start, u, tread / 2), startRadius: clamp(fw * 0.04, 20, 45),
    label: add(add(start, u, Math.max(tread, labelSize) * 0.9), n, fw * 0.28), labelSize,
    breakLine: breakPolyline(add(add(m, n, -fw / 2), u, -h / 2), add(add(m, n, fw / 2), u, h / 2)),
  };
}
/** 两侧并列梯段（U 的两跑、三跑的第 1 / 3 跑）的长度比例：取 flightLengths，缺省等长。 */
function sideRatios(spec: StairSpec, a: number, b: number): [number, number] {
  const L = spec.flightLengths, la = L?.[a] ?? 1, lb = L?.[b] ?? 1, max = Math.max(la, lb);
  return [la / max, lb / max];
}

/** 正向、右转的梯段几何（局部坐标：外框中心为原点，起步在下方 +y，向 -y 上行）。外框始终为准，各跑长度在外框内落位。 */
function flightLayout(spec: StairSpec, w: number, d: number): FlightLayout {
  const L = -w / 2, R = w / 2, T = -d / 2, B = d / 2, widths = stairFlightWidths(spec), steps = stairFlightSteps(spec.form, spec.steps);
  if (spec.form === 'l') {
    const f1 = Math.min(widths[0], w * 0.6), f2 = Math.min(widths[1], d * 0.6), [n1, n2] = steps;
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
    const ld = Math.max(f1, f2), ly = T + ld, [n1, n2] = steps, [r1, r2] = sideRatios(spec, 0, 1);
    const b1 = ly + (B - ly) * r1, b2 = ly + (B - ly) * r2, t1 = (b1 - ly) / n1, t2 = (b2 - ly) / n2;
    const well: [Point, Point][] = w - f1 - f2 > 1 ? [[[L + f1, ly], [L + f1, b1]], [[R - f2, ly], [R - f2, b2]]] : [[[L + f1, ly], [L + f1, Math.max(b1, b2)]]];
    return {
      outline: Math.abs(b1 - b2) < 1e-6 ? { kind: 'rect' } : { kind: 'polygon', points: [[L, b1], [L, T], [R, T], [R, b2], [R - f2, b2], [R - f2, ly], [L + f1, ly], [L + f1, b1]] },
      lines: [...verticalTreads(L, f1, b1, ly, n1), [[L, ly], [L + f1, ly]], [[R - f2, ly], [R, ly]], ...well, ...verticalTreads(R - f2, f2, ly, b2, n2)],
      walk: [[L + f1 / 2, b1 - t1 / 2], [L + f1 / 2, T + ld / 2], [R - f2 / 2, T + ld / 2], [R - f2 / 2, b2 - t2 / 2]],
      flights: [{ start: [L + f1 / 2, b1], end: [L + f1 / 2, ly], width: f1, tread: t1 }, { start: [R - f2 / 2, ly], end: [R - f2 / 2, b2], width: f2, tread: t2 }],
    };
  }
  if (spec.form === 'triple') {
    const k = Math.min(1, (w * 0.8) / (widths[0] + widths[2])), f1 = widths[0] * k, f3 = widths[2] * k, f2 = Math.min(widths[1], d * 0.6);
    const [n1, n2, n3] = steps, ly = T + f2, [r1, r3] = sideRatios(spec, 0, 2), b1 = ly + (B - ly) * r1, b3 = ly + (B - ly) * r3;
    const t1 = (b1 - ly) / n1, t2 = (w - f1 - f3) / n2, t3 = (b3 - ly) / n3;
    return {
      outline: { kind: 'polygon', points: [[L, b1], [L, T], [R, T], [R, b3], [R - f3, b3], [R - f3, ly], [L + f1, ly], [L + f1, b1]] },
      lines: [...verticalTreads(L, f1, b1, ly, n1), [[L, ly], [L + f1, ly]], [[L + f1, T], [L + f1, ly]],
        ...horizontalTreads(T, f2, L + f1, R - f3, n2), [[R - f3, T], [R - f3, ly]], [[R - f3, ly], [R, ly]], ...verticalTreads(R - f3, f3, ly, b3, n3)],
      walk: [[L + f1 / 2, b1 - t1 / 2], [L + f1 / 2, T + f2 / 2], [R - f3 / 2, T + f2 / 2], [R - f3 / 2, b3 - t3 / 2]],
      flights: [{ start: [L + f1 / 2, b1], end: [L + f1 / 2, ly], width: f1, tread: t1 }, { start: [L + f1, T + f2 / 2], end: [R - f3, T + f2 / 2], width: f2, tread: t2 },
        { start: [R - f3 / 2, ly], end: [R - f3 / 2, b3], width: f3, tread: t3 }],
    };
  }
  const fw = Math.min(spec.flightWidth, w), [n] = steps, t = d / n, x0 = -fw / 2;
  return {
    outline: { kind: 'rect' },
    lines: [...verticalTreads(x0, fw, B, T, n), ...(fw < w - 1 ? [[[x0, T], [x0, B]], [[-x0, T], [-x0, B]]] as [Point, Point][] : [])],
    walk: [[0, B - t / 2], [0, T + t / 2]],
    flights: [{ start: [0, B], end: [0, T], width: fw, tread: t }],
  };
}

/** 外框内实际的各跑长度（mm）；螺旋楼梯返回空数组。 */
export function stairFlightLengths(spec: StairSpec, w: number, d: number): number[] {
  return spec.form === 'spiral' ? [] : flightLayout(spec, w, d).flights.map(f => dist(f.start, f.end));
}
/** U 型当前梯井净宽（mm）；其他类别为 0。 */
export function stairWellGap(spec: StairSpec, w: number, d: number): number {
  if (spec.form !== 'u') return 0;
  const [a, b] = flightLayout(spec, w, d).flights;
  return Math.max(0, w - a.width - b.width);
}

/** 由梯段宽、梯段长、梯井（或螺旋的踏面宽）推导外框 w × d（mm）。 */
export function stairSizeOf(spec: StairSpec): { w: number; d: number } {
  const gap = stairWell(spec);
  const widths = stairFlightWidths(spec);
  if (spec.form === 'spiral') {
    const step = SPIRAL_SWEEP / clamp(Math.round(spec.steps), STAIR_STEPS_MIN, STAIR_STEPS_MAX);
    const inner = Math.max(150, stairTread(spec) / step - STAIR_RULES.spiralMeasureOffset), size = 2 * (inner + widths[0]);
    return { w: size, d: size };
  }
  const runs = spec.flightLengths?.length === widths.length ? spec.flightLengths : stairStandardLengths(spec);
  if (spec.form === 'l') return { w: widths[0] + runs[1], d: widths[1] + runs[0] };
  if (spec.form === 'u') return { w: widths[0] + widths[1] + gap, d: Math.max(widths[0], widths[1]) + Math.max(runs[0], runs[1]) };
  if (spec.form === 'triple') return { w: widths[0] + runs[1] + widths[2], d: widths[1] + Math.max(runs[0], runs[2]) };
  return { w: widths[0], d: runs[0] };
}

/**
 * 更新楼梯参数（纯函数）：
 * - 未手动指定踏步数且已知层高时，踏步数 = 层高 ÷ 踏步高；
 * - 踏步数、踏面宽或类别变化时，梯段长回到行业标准（该跑踏步数 × 踏面宽）；
 * - 直接给出 lengths 时以它为准（用户改某一跑长度）；
 * - 其他情况保留当前梯段长（旧数据从外框推出）。
 */
export function updateStair(spec: StairSpec, patch: Partial<StairSpec>,
  opts: { floorHeight?: number; lengths?: number[]; size?: { w: number; d: number } } = {}): StairSpec {
  const next: StairSpec = { ...spec, ...patch };
  if (opts.floorHeight !== undefined && !next.stepsManual) next.steps = stairSteps(opts.floorHeight, stairRiser(next));
  if (next.form === 'spiral') { delete next.flightLengths; return next; }
  const current = spec.flightLengths?.length === stairFlightCount(spec.form) ? spec.flightLengths
    : opts.size ? stairFlightLengths(spec, opts.size.w, opts.size.d) : undefined;
  const standard = !current || next.form !== spec.form || next.steps !== spec.steps || stairTread(next) !== stairTread(spec);
  next.flightLengths = (opts.lengths ?? (standard ? stairStandardLengths(next) : current!)).map(v => Math.round(clamp(v, STAIR_LENGTH_MIN, STAIR_LENGTH_MAX)));
  return next;
}
/** 更新楼梯并按梯段长同步外框。旧 U 型数据没有 wellGap 时，先从当前外框量出梯井，避免外框跳变。 */
export function resizeStair(f: Furniture, patch: Partial<StairSpec>, floorHeight?: number, lengths?: number[]): Furniture {
  const spec = stairSpec(f), stair = updateStair(spec, patch, { floorHeight, lengths, size: f });
  if (stair.form === 'u' && stair.wellGap === undefined)
    stair.wellGap = spec.form === 'u' ? Math.round(clamp(stairWellGap(spec, f.w, f.d), STAIR_WELL_MIN, STAIR_WELL_MAX)) : STAIR_WELL_GAP;
  if (stair.form !== 'u') delete stair.wellGap;
  const size = stairSizeOf(stair);
  return { ...f, w: Math.round(size.w), d: Math.round(size.d), stair };
}

/**
 * 在「尺寸与位置」里直接改外框后，按新外框反推各跑宽 / 长（U 型保留梯井、两跑等比缩放），
 * 使楼梯参数与外框一致；之后再调楼梯细节时外框不会回退。`prefer` 是用户改的那一边（螺旋楼梯据此取正方形）。
 */
export function fitStairToBox(f: Furniture, prefer: 'w' | 'd' = 'w'): Furniture {
  if (!f.stair) return f;
  const spec = f.stair, width = (v: number) => Math.round(clamp(v, STAIR_FLIGHT_MIN, STAIR_FLIGHT_MAX));
  const run = (v: number) => Math.round(clamp(v, STAIR_LENGTH_MIN, STAIR_LENGTH_MAX));
  let stair: StairSpec;
  if (spec.form === 'spiral') {
    const size = prefer === 'w' ? f.w : f.d, outer = size / 2, fw = width(Math.min(spec.flightWidth, outer * 0.85));
    const step = SPIRAL_SWEEP / clamp(Math.round(spec.steps), STAIR_STEPS_MIN, STAIR_STEPS_MAX);
    stair = { ...spec, flightWidth: fw, treadDepth: Math.round(clamp((outer - fw + STAIR_RULES.spiralMeasureOffset) * step, STAIR_TREAD_MIN, STAIR_TREAD_MAX)) };
  } else if (spec.form === 'u') {
    const widths = stairFlightWidths(spec), gap = Math.min(stairWell(spec), Math.max(0, f.w - 2 * STAIR_FLIGHT_MIN));
    const k = (f.w - gap) / (widths[0] + widths[1]), f1 = width(widths[0] * k), f2 = width(widths[1] * k);
    const runs = spec.flightLengths?.length === 2 ? spec.flightLengths : stairFlightLengths(spec, f.w, f.d);
    const r = (f.d - Math.max(f1, f2)) / Math.max(runs[0], runs[1]);
    stair = { ...spec, flightWidth: f1, flightWidths: [f1, f2], flightLengths: runs.map(v => run(v * r)), wellGap: Math.round(Math.max(0, f.w - f1 - f2)) };
  } else if (spec.form === 'straight') {
    stair = { ...spec, flightWidth: width(f.w), flightLengths: [run(f.d)] };
  } else {
    const flights = flightLayout(spec, f.w, f.d).flights, widths = flights.map(fl => width(fl.width));
    stair = { ...spec, flightWidth: widths[0], flightWidths: widths, flightLengths: flights.map(fl => run(dist(fl.start, fl.end))) };
  }
  const size = stairSizeOf(stair);
  return { ...f, w: Math.round(size.w), d: Math.round(size.d), stair };
}

export interface StairBoxTerm { label: string; value: number }
/** 外框宽 / 深由哪些尺寸相加而来，用于在编辑面板里说明外框为什么是这个值。螺旋楼梯返回外径。 */
export function stairBoxTerms(spec: StairSpec): { w: StairBoxTerm[]; d: StairBoxTerm[] } {
  const widths = stairFlightWidths(spec);
  if (spec.form === 'spiral') { const { w } = stairSizeOf(spec); return { w: [{ label: '外径', value: w }], d: [] }; }
  const runs = spec.flightLengths?.length === widths.length ? spec.flightLengths : stairStandardLengths(spec);
  if (spec.form === 'l') return { w: [{ label: '第 1 跑宽', value: widths[0] }, { label: '第 2 跑长', value: runs[1] }],
    d: [{ label: '第 2 跑宽', value: widths[1] }, { label: '第 1 跑长', value: runs[0] }] };
  if (spec.form === 'u') return { w: [{ label: '第 1 跑宽', value: widths[0] }, { label: '梯井', value: stairWell(spec) }, { label: '第 2 跑宽', value: widths[1] }],
    d: [{ label: '平台', value: Math.max(widths[0], widths[1]) }, { label: '较长一跑', value: Math.max(runs[0], runs[1]) }] };
  if (spec.form === 'triple') return { w: [{ label: '第 1 跑宽', value: widths[0] }, { label: '第 2 跑长', value: runs[1] }, { label: '第 3 跑宽', value: widths[2] }],
    d: [{ label: '第 2 跑宽', value: widths[1] }, { label: '较长边跑', value: Math.max(runs[0], runs[2]) }] };
  return { w: [{ label: '梯段宽', value: widths[0] }], d: [{ label: '梯段长', value: runs[0] }] };
}
/** 层高变化后，所有自动踏步数的楼梯按新层高重算（手动指定的不变）。 */
export function syncStairsToHeight(design: Design): Design {
  let changed = false;
  const furniture = design.furniture.map(f => {
    if (!isStairs(f) || !f.stair || f.stair.stepsManual || f.stair.steps === stairSteps(design.height, stairRiser(f.stair))) return f;
    changed = true;
    return resizeStair(f, {}, design.height);
  });
  return changed ? { ...design, furniture } : design;
}

/** 预设在默认层高（2800 mm）下的参数与外框。 */
const presetStair = (p: StairPreset) => updateStair({ form: p.form, flightWidth: p.flightWidth, steps: p.steps }, {});
export const stairLibrary: LibraryItem[] = STAIR_PRESETS.map(p => {
  const stair = presetStair(p), { w, d } = stairSizeOf(stair);
  return { catalogId: stairCatalogId(p), category: STAIR_CATEGORY, type: 'stairs', name: p.name, w: Math.round(w), d: Math.round(d), color: '#e6dccc', stair };
});

/** 切换类别：参数换成该类别预设，外框按梯段长推导，位置与旋转保留；名称仍是预设名时一并换名，单价跟随类别。层高已知时踏步数按层高推算。 */
export function applyStairForm(f: Furniture, form: StairForm, floorHeight?: number): Furniture {
  const preset = stairPreset(form), presetNames = [...STAIR_PRESETS.map(p => p.name), '楼梯'];
  const stair = updateStair({ form, flightWidth: preset.flightWidth, steps: preset.steps }, {}, { floorHeight }), { w, d } = stairSizeOf(stair);
  return {
    ...f, w: Math.round(w), d: Math.round(d), catalogId: stairCatalogId(preset),
    name: presetNames.includes(f.name) ? preset.name : f.name, stair,
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
  if (spec.form === 'spiral') return spiralLayout(spec, clamp(Math.round(spec.steps), STAIR_STEPS_MIN, STAIR_STEPS_MAX), w, d);
  const raw = flightLayout(spec, w, d), last = raw.flights[raw.flights.length - 1];
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
/** 推导实际踏面宽 / 踏步高，并按 GB 50096 套内楼梯给出提示（只提示不拦截）。 */
export function stairMetrics(spec: StairSpec, w: number, d: number, floorHeight: number): StairMetrics {
  const layout = stairLayout(spec, w, d), riserHeight = floorHeight / spec.steps, warnings: string[] = [];
  if (layout.flightWidth < STAIR_RULES.flightWidth) warnings.push('梯段宽小于 0.75 m，不满足套内楼梯最小净宽');
  if (layout.treadDepth < STAIR_RULES.treadDepth)
    warnings.push(spec.form === 'spiral' ? '距内侧 0.25 m 处踏面宽小于 0.22 m，可加大梯段宽或减少踏步数' : '踏面宽小于 0.22 m，可加长梯段或减少踏步数');
  if (riserHeight > STAIR_RULES.riserHeight) warnings.push('踏步高大于 0.20 m，可减小踏步高或增加踏步数');
  return { flightWidth: layout.flightWidth, treadDepth: layout.treadDepth, riserHeight, warnings };
}
