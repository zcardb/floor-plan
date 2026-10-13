import { length } from '@/lib/floor-plan/geometry';
import { wallContact } from './furniture-follow';
import type { Design, Selection, Wall } from '@/lib/floor-plan/types';

/** 门窗或贴墙家具在所在墙上的占位：start / end 为自墙 A 端量起的两端位置（mm）。 */
export interface WallPlacement {
  wall: Wall;
  start: number;
  end: number;
  /** 墙在图上偏横向时两端叫「左 / 右」，偏竖向时叫「上 / 下」；aFirst 表示 A 端是左（上）端。 */
  names: [string, string];
  aFirst: boolean;
}

function describe(wall: Wall): Pick<WallPlacement, 'names' | 'aFirst'> {
  const dx = wall.b[0] - wall.a[0], dy = wall.b[1] - wall.a[1];
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  return { names: horizontal ? ['左', '右'] : ['上', '下'], aFirst: horizontal ? dx >= 0 : dy >= 0 };
}

/** 选中对象在墙上的占位；家具不贴墙时返回 null。贴着多面墙时取沿墙重叠最长的那面。 */
export function wallPlacement(d: Design, s: Selection): WallPlacement | null {
  if (s?.kind === 'opening') {
    const o = d.openings.find(o => o.id === s.id), wall = d.walls.find(w => w.id === o?.wallId);
    if (!o || !wall) return null;
    return { wall, start: o.offset - o.width / 2, end: o.offset + o.width / 2, ...describe(wall) };
  }
  if (s?.kind !== 'furniture') return null;
  const f = d.furniture.find(f => f.id === s.id);
  if (!f) return null;
  let best: WallPlacement | null = null, bestOverlap = 0;
  for (const wall of d.walls) {
    if (d.demolished.includes(wall.id)) continue;
    const c = wallContact(f, wall);
    if (!c) continue;
    const start = c.t - c.tangentHalf, end = c.t + c.tangentHalf;
    const overlap = Math.min(end, length(wall)) - Math.max(start, 0);
    if (overlap > bestOverlap) { bestOverlap = overlap; best = { wall, start, end, ...describe(wall) }; }
  }
  return best;
}

/** 两端净距（按左/上在前的顺序）。 */
export function placementGaps(p: WallPlacement): [number, number] {
  const fromA = p.start, fromB = length(p.wall) - p.end;
  return p.aFirst ? [fromA, fromB] : [fromB, fromA];
}

/** 由「距第一端 / 第二端的净距」求沿墙位移（mm，正向为 A→B）；两者都给时以第一端为准。 */
export function placementShift(p: WallPlacement, gaps: { gap0?: number; gap1?: number }): number {
  const L = length(p.wall), size = p.end - p.start;
  const [g0] = placementGaps(p);
  const want0 = gaps.gap0 ?? (gaps.gap1 !== undefined ? L - size - gaps.gap1 : g0);
  const shift = p.aFirst ? want0 - g0 : g0 - want0;
  if (p.start + shift < -0.01 || p.end + shift > L + 0.01) throw new Error('超出所在墙段范围');
  return shift;
}
