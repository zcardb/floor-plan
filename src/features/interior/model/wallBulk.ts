import { mergeWall, wallMergeGroup } from './wallMerge';
import { isBearingWall } from './wallPolicy';
import type { Design } from './types';

/**
 * 清空分割：把所有可合并的连续墙段合并成整段（规则同单墙「取消分割」：同类型、同厚度、同颜色、共线相接，
 * 遇到交界/分叉处停止）。合并会造成门窗冲突的墙段跳过。
 */
export function mergeAllSplits(design: Design): { design: Design; merged: number; skipped: number } {
  let d = design, merged = 0;
  const skipped = new Set<string>();
  for (;;) {
    const wall = d.walls.find(w => !skipped.has(w.id) && wallMergeGroup(d, w.id).length > 1);
    if (!wall) break;
    const group = wallMergeGroup(d, wall.id);
    try {
      d = mergeWall(d, wall.id).design;
      merged += group.length - 1;
    } catch {
      group.forEach(w => skipped.add(w.id));
    }
  }
  return { design: d, merged, skipped: skipped.size };
}

/** 当前生效的承重墙（含原始承重墙与用户标记），已拆除的不计。 */
export const bearingWalls = (design: Design) => design.walls.filter(w => isBearingWall(w) && !design.demolished.includes(w.id));

/** 清空承重：所有墙体取消承重，原始承重墙改为普通隔墙。 */
export function clearBearing(design: Design): Design {
  if (!bearingWalls(design).length) return design;
  return {
    ...design,
    walls: design.walls.map(w => {
      if (!isBearingWall(w)) return w;
      const next = { ...w, kind: w.kind === 'bearing' ? 'partition' as const : w.kind };
      delete next.loadBearing;
      return next;
    }),
  };
}
