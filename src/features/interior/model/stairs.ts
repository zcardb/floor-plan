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

export const stairPreset = (form: StairForm) => STAIR_PRESETS.find(p => p.form === form)!;
export const stairCatalogId = (preset: StairPreset) => `stairs:${preset.name}`;
export const isStairForm = (form: unknown): form is StairForm => STAIR_FORMS.includes(form as StairForm);
export function validStairSpec(spec: unknown): boolean {
  if (!spec || typeof spec !== 'object') return false;
  const s = spec as StairSpec;
  return isStairForm(s.form) && Number.isInteger(s.steps) && s.steps >= STAIR_STEPS_MIN && s.steps <= STAIR_STEPS_MAX &&
    typeof s.flightWidth === 'number' && Number.isFinite(s.flightWidth) && s.flightWidth >= STAIR_FLIGHT_MIN && s.flightWidth <= STAIR_FLIGHT_MAX;
}
/** 旧楼梯没有 stair 字段：按直跑、梯段宽等于外框宽、12 级处理（与旧图样一致）。 */
export const stairSpec = (f: Pick<Furniture, 'w' | 'stair'>): StairSpec => f.stair ?? { form: 'straight', flightWidth: f.w, steps: 12 };

export const stairLibrary: LibraryItem[] = STAIR_PRESETS.map(p => ({
  catalogId: stairCatalogId(p), category: '客厅', type: 'stairs', name: p.name, w: p.w, d: p.d, color: '#e6dccc',
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
  /** 行走线（梯段中线）。 */
  walk: Point[];
  arrow: Point[];
  start: Point;
  startRadius: number;
  label: Point;
  labelSize: number;
  breakLine: Point[];
  /** 实际使用的梯段宽（已夹到外框能容纳的范围）。 */
  flightWidth: number;
  /** 最窄踏步宽（mm）。 */
  treadDepth: number;
}
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
/** 竖向第一跑上的折断线与「上」字、起步点。 */
function firstFlightMarks(x0: number, fw: number, yStart: number, run: number, tread: number) {
  const yb = yStart - run * 0.5, h = Math.min(fw * 0.6, run * 0.4);
  const labelSize = clamp(Math.min(fw * 0.2, tread * 1.2), 100, 220);
  const start: Point = [x0 + fw / 2, yStart - tread / 2];
  return {
    breakLine: breakPolyline([x0, yb + h / 2], [x0 + fw, yb - h / 2]),
    start, startRadius: clamp(fw * 0.04, 20, 45),
    label: [x0 + fw * 0.78, yStart - Math.max(tread, labelSize) * 0.9] as Point, labelSize,
  };
}

/** 楼梯平面几何（局部坐标：外框中心为原点，起步在下方 +y，向 -y 上行）。 */
export function stairLayout(spec: StairSpec, w: number, d: number): StairLayout {
  const n = clamp(Math.round(spec.steps), STAIR_STEPS_MIN, STAIR_STEPS_MAX);
  const L = -w / 2, R = w / 2, T = -d / 2, B = d / 2;
  if (spec.form === 'spiral') {
    const outer = Math.min(w, d) / 2, fw = Math.min(spec.flightWidth, outer * 0.85), inner = outer - fw, rm = (inner + outer) / 2;
    const step = SPIRAL_SWEEP / n, a0 = Math.PI / 2, polar = (r: number, a: number): Point => [r * Math.cos(a), r * Math.sin(a)];
    const lines = Array.from({ length: n + 1 }, (_, i) => [polar(inner, a0 + step * i), polar(outer, a0 + step * i)] as [Point, Point]);
    const from = a0 + step / 2, to = a0 + SPIRAL_SWEEP - step / 2, count = Math.max(8, Math.ceil((to - from) / (Math.PI / 36)));
    const walk = Array.from({ length: count + 1 }, (_, i) => polar(rm, from + (to - from) * i / count));
    const ab = a0 + SPIRAL_SWEEP * 0.45, labelSize = clamp(fw * 0.22, 90, 200);
    return {
      outline: { kind: 'circle', r: outer }, column: inner, lines, walk,
      arrow: arrowHead(walk[walk.length - 2], walk[walk.length - 1], clamp(fw * 0.2, 60, 160)),
      start: walk[0], startRadius: clamp(fw * 0.05, 20, 40),
      label: polar(rm, a0 - (2 * Math.PI - SPIRAL_SWEEP) / 2), labelSize,
      breakLine: breakPolyline(polar(inner, ab - step * 0.4), polar(outer, ab + step * 0.4)),
      flightWidth: fw, treadDepth: (inner + STAIR_RULES.spiralMeasureOffset) * step,
    };
  }
  if (spec.form === 'l') {
    const fw = Math.min(spec.flightWidth, Math.min(w, d) * 0.6), n1 = Math.ceil(n / 2), n2 = n - n1;
    const run1 = d - fw, run2 = w - fw, t1 = run1 / n1, t2 = run2 / n2, ly = T + fw, lx = L + fw;
    const walk: Point[] = [[L + fw / 2, B - t1 / 2], [L + fw / 2, T + fw / 2], [R - t2 / 2, T + fw / 2]];
    return {
      outline: { kind: 'polygon', points: [[L, B], [L, T], [R, T], [R, ly], [lx, ly], [lx, B]] },
      lines: [...verticalTreads(L, fw, B, ly, n1), [[L, ly], [lx, ly]], [[lx, T], [lx, ly]], ...horizontalTreads(T, fw, lx, R, n2)],
      walk, arrow: arrowHead(walk[1], walk[2], clamp(fw * 0.2, 60, 180)),
      ...firstFlightMarks(L, fw, B, run1, t1), flightWidth: fw, treadDepth: Math.min(t1, t2),
    };
  }
  if (spec.form === 'u') {
    const fw = Math.min(spec.flightWidth, w / 2, d * 0.5), n1 = Math.ceil(n / 2), n2 = n - n1;
    const run = d - fw, t1 = run / n1, t2 = run / n2, ly = T + fw, gap = w - 2 * fw;
    const walk: Point[] = [[L + fw / 2, B - t1 / 2], [L + fw / 2, T + fw / 2], [R - fw / 2, T + fw / 2], [R - fw / 2, B - t2 / 2]];
    const well: [Point, Point][] = gap > 1 ? [[[L + fw, ly], [L + fw, B]], [[R - fw, ly], [R - fw, B]]] : [[[0, ly], [0, B]]];
    return {
      outline: { kind: 'rect' },
      lines: [...verticalTreads(L, fw, B, ly, n1), [[L, ly], [L + fw, ly]], [[R - fw, ly], [R, ly]], ...well, ...verticalTreads(R - fw, fw, ly, B, n2)],
      walk, arrow: arrowHead(walk[2], walk[3], clamp(fw * 0.2, 60, 180)),
      ...firstFlightMarks(L, fw, B, run, t1), flightWidth: fw, treadDepth: Math.min(t1, t2),
    };
  }
  if (spec.form === 'triple') {
    const fw = Math.min(spec.flightWidth, w * 0.4, d * 0.6), n1 = Math.ceil(n / 3), n2 = Math.ceil((n - n1) / 2), n3 = n - n1 - n2;
    const run1 = d - fw, run2 = w - 2 * fw, t1 = run1 / n1, t2 = run2 / n2, t3 = run1 / n3, ly = T + fw;
    const walk: Point[] = [[L + fw / 2, B - t1 / 2], [L + fw / 2, T + fw / 2], [R - fw / 2, T + fw / 2], [R - fw / 2, B - t3 / 2]];
    return {
      outline: { kind: 'polygon', points: [[L, B], [L, T], [R, T], [R, B], [R - fw, B], [R - fw, ly], [L + fw, ly], [L + fw, B]] },
      lines: [...verticalTreads(L, fw, B, ly, n1), [[L, ly], [L + fw, ly]], [[L + fw, T], [L + fw, ly]],
        ...horizontalTreads(T, fw, L + fw, R - fw, n2), [[R - fw, T], [R - fw, ly]], [[R - fw, ly], [R, ly]], ...verticalTreads(R - fw, fw, ly, B, n3)],
      walk, arrow: arrowHead(walk[2], walk[3], clamp(fw * 0.2, 60, 180)),
      ...firstFlightMarks(L, fw, B, run1, t1), flightWidth: fw, treadDepth: Math.min(t1, t2, t3),
    };
  }
  const fw = Math.min(spec.flightWidth, w), t = d / n, x0 = -fw / 2;
  const sides: [Point, Point][] = fw < w - 1 ? [[[x0, T], [x0, B]], [[-x0, T], [-x0, B]]] : [];
  const walk: Point[] = [[0, B - t / 2], [0, T + t / 2]];
  return {
    outline: { kind: 'rect' }, lines: [...verticalTreads(x0, fw, B, T, n), ...sides],
    walk, arrow: arrowHead(walk[0], walk[1], clamp(fw * 0.2, 60, 180)),
    ...firstFlightMarks(x0, fw, B, d, t), flightWidth: fw, treadDepth: t,
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
