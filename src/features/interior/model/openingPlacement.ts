import { defaultOpeningSize } from './hardMaterials';
import { length } from './geometry';
import type { Design, OpeningKind, Wall } from './types';

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
