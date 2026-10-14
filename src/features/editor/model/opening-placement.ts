import { defaultOpeningSize } from '@/lib/floor-plan/hard-materials';
import { length } from '@/lib/floor-plan/geometry';
import type { Design, Opening, OpeningKind, Wall } from '@/lib/floor-plan/types';

/** 放不下默认宽度时自动缩到可用最大宽度的门窗种类（垭口等其他开口不缩）。 */
const AUTO_FIT: ReadonlySet<OpeningKind> = new Set(['door', 'window']);
/** 门窗宽度下限，与尺寸编辑的校验一致（mm）。 */
export const MIN_OPENING_WIDTH = 100;
/** 自动缩小时宽度取整到整厘米，读数干净且一定放得下。 */
const FIT_STEP = 10;

export type OpeningPlacement =
  | { ok: true; offset: number; width: number; /** 是否因空间不足被自动缩窄 */ fitted: boolean }
  | { ok: false; reason: string };

/**
 * 在墙上点击 `at`（沿墙距离，mm）新增门窗时的位置与宽度：
 * 先找点击处两侧最近的门窗或墙端围成的空档；默认宽度放得下就在空档内贴近点击处，
 * 放不下时门 / 窗自动缩到空档的最大宽度并居中，其他开口仍提示长度不足。
 */
export function placeOpening(design: Pick<Design, 'openings'>, wall: Wall, kind: OpeningKind, at: number): OpeningPlacement {
  const L = length(wall), want = defaultOpeningSize(kind).width;
  const t = Math.min(L, Math.max(0, at));
  const spans = design.openings
    .filter(o => o.wallId === wall.id)
    .map(o => [o.offset - o.width / 2, o.offset + o.width / 2] as const);
  if (spans.some(([s, e]) => t > s && t < e)) return { ok: false, reason: '门窗不能重叠' };
  const lo = Math.max(0, ...spans.filter(([, e]) => e <= t).map(([, e]) => e));
  const hi = Math.min(L, ...spans.filter(([s]) => s >= t).map(([s]) => s));
  const free = hi - lo;
  if (want <= free)
    return { ok: true, width: want, offset: Math.min(hi - want / 2, Math.max(lo + want / 2, t)), fitted: false };
  const width = Math.floor(free / FIT_STEP) * FIT_STEP;
  if (!AUTO_FIT.has(kind) || width < MIN_OPENING_WIDTH)
    return { ok: false, reason: want > L || width < MIN_OPENING_WIDTH ? '此墙段长度不足' : '门窗不能重叠' };
  return { ok: true, width, offset: (lo + hi) / 2, fitted: true };
}

/** 可以复制的开口：门和窗（垭口不提供复制）。 */
export const canDuplicateOpening = (o: Pick<Opening, 'kind'> | null | undefined) => !!o && AUTO_FIT.has(o.kind);

export type OpeningDuplicate =
  | { ok: true; design: Design; id: string; /** 是否因空间不足被自动缩窄 */ fitted: boolean }
  | { ok: false; reason: string };

/**
 * 复制门 / 窗：复制件保留款式、开向、高度等全部属性，放在同一面墙上离原件最近、
 * 放得下原宽度的空档里（同样近时优先右侧）；没有这样的空档时缩到最大空档的宽度并居中，
 * 最大空档也不足 10cm 时不复制。
 */
export function duplicateOpening(design: Design, openingId: string, id: string): OpeningDuplicate {
  const source = design.openings.find(o => o.id === openingId);
  const wall = source && design.walls.find(w => w.id === source.wallId);
  if (!source || !wall || !canDuplicateOpening(source)) return { ok: false, reason: '只能复制门或窗' };
  const L = length(wall);
  const spans = design.openings
    .filter(o => o.wallId === wall.id)
    .map(o => [o.offset - o.width / 2, o.offset + o.width / 2] as const)
    .sort((a, b) => a[0] - b[0]);
  const gaps: [number, number][] = [];
  let cursor = 0;
  for (const [s, e] of spans) {
    if (s > cursor) gaps.push([cursor, Math.min(s, L)]);
    cursor = Math.max(cursor, e);
  }
  if (cursor < L) gaps.push([cursor, L]);
  const want = source.width;
  let best: { offset: number; distance: number } | null = null;
  for (const [lo, hi] of gaps) {
    if (hi - lo < want) continue;
    const offset = Math.min(hi - want / 2, Math.max(lo + want / 2, source.offset));
    const distance = Math.abs(offset - source.offset) - (offset > source.offset ? 0.5 : 0);
    if (!best || distance < best.distance) best = { offset, distance };
  }
  let placed: { offset: number; width: number; fitted: boolean } | null = best && { offset: best.offset, width: want, fitted: false };
  if (!placed) {
    const [lo, hi] = gaps.reduce<[number, number]>((a, g) => (g[1] - g[0] > a[1] - a[0] ? g : a), [0, 0]);
    const width = Math.floor((hi - lo) / FIT_STEP) * FIT_STEP;
    if (width < MIN_OPENING_WIDTH) return { ok: false, reason: '这面墙上没有空位放复制的' + (source.kind === 'door' ? '门' : '窗') };
    placed = { offset: (lo + hi) / 2, width, fitted: true };
  }
  const copy: Opening = { ...source, id, offset: placed.offset, width: placed.width };
  return { ok: true, design: { ...design, openings: [...design.openings, copy] }, id, fitted: placed.fitted };
}
