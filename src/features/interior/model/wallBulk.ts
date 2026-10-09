import { length } from './geometry';
import { combineCollinearWalls } from './wallMerge';
import { splitTolerance as tolerance } from './wallSplit';
import { isBearingWall } from './wallPolicy';
import type { Design, Point, Wall, WallKind } from './types';

/** 合并后整面墙的类型优先级：外围 > 承重 > 隔墙 > 矮墙。 */
const KIND_RANK: Record<WallKind, number> = { exterior: 3, bearing: 2, partition: 1, low: 0 };

/**
 * 同一直线上首尾相接或重叠的墙段链：不论类型、厚度、颜色，交界处也不打断；真实空隙不桥接。
 * 只返回含 2 段及以上的链。
 */
export function collinearWallChains(design: Design): Wall[][] {
  const live = design.walls.filter(w => !design.demolished.includes(w.id) && length(w) >= tolerance);
  const seen = new Set<string>();
  const chains: Wall[][] = [];
  for (const wall of live) {
    if (seen.has(wall.id)) continue;
    const L = length(wall), dx = (wall.b[0] - wall.a[0]) / L, dy = (wall.b[1] - wall.a[1]) / L;
    const onLine = (p: Point) => Math.abs((p[0] - wall.a[0]) * dy - (p[1] - wall.a[1]) * dx) < tolerance;
    const project = (p: Point) => (p[0] - wall.a[0]) * dx + (p[1] - wall.a[1]) * dy;
    const line = live.filter(w => !seen.has(w.id) && onLine(w.a) && onLine(w.b))
      .map(w => ({ w, lo: Math.min(project(w.a), project(w.b)), hi: Math.max(project(w.a), project(w.b)) }))
      .sort((p, q) => p.lo - q.lo);
    line.forEach(c => seen.add(c.w.id));
    let chain: Wall[] = [], hi = -Infinity;
    for (const c of line) {
      if (chain.length && c.lo > hi + tolerance) {
        if (chain.length > 1) chains.push(chain);
        chain = [];
        hi = -Infinity;
      }
      chain.push(c.w);
      hi = Math.max(hi, c.hi);
    }
    if (chain.length > 1) chains.push(chain);
  }
  return chains;
}

/** 整条线合并后的墙：类型取最高优先级，厚度/颜色/id 取该类型中最长的一段；任一段承重则整面墙承重。 */
function chainBase(design: Design, chain: Wall[]): Wall {
  // 门窗满宽墙段（洞口宽 = 墙段长）只是洞口的载体，类型常与所在墙不一致，不参与类型判定。
  const isOpeningHost = (w: Wall) => design.openings.some(o => o.wallId === w.id && Math.abs(o.width - length(w)) < tolerance);
  const solid = chain.filter(w => !isOpeningHost(w));
  const ranked = solid.length ? solid : chain;
  const top = Math.max(...ranked.map(w => KIND_RANK[w.kind]));
  const base = ranked.filter(w => KIND_RANK[w.kind] === top).sort((a, b) => length(b) - length(a))[0];
  const ids = new Set(chain.map(w => w.id));
  // 外围墙被分割过：整组都在链内且原 id 空闲时恢复原墙 id。
  const root = base.kind === 'exterior' ? chain.find(w => w.exteriorRootId)?.exteriorRootId : undefined;
  const restored = !!root && design.walls.filter(w => w.exteriorRootId === root).every(w => ids.has(w.id)) &&
    !design.walls.some(w => w.id === root && !ids.has(w.id));
  const merged: Wall = { ...base, id: restored ? root! : base.id };
  delete merged.exteriorRootId;
  delete merged.loadBearing;
  if (base.kind !== 'bearing' && chain.some(isBearingWall)) merged.loadBearing = true;
  return merged;
}

/**
 * 清空分割：每条直线上相连的墙段一拉到底合并为一整面墙（交界、类型变化处都不打断）。
 * 合并会造成门窗重叠/越界的那条线保持原样，段数计入 skipped。
 */
export function mergeAllSplits(design: Design): { design: Design; merged: number; skipped: number } {
  let d = design, merged = 0, skipped = 0;
  for (const chain of collinearWallChains(design)) {
    try {
      d = combineCollinearWalls(d, chain, chainBase(d, chain)).design;
      merged += chain.length - 1;
    } catch {
      skipped += chain.length;
    }
  }
  return { design: d, merged, skipped };
}

const splitCache = new WeakMap<Design['walls'], { demolished: string[]; count: number }>();
/** 可清除的分割点数量（每条 n 段的直线计 n-1 处）。按墙体数组缓存，菜单每次渲染都可直接调用。 */
export function splitPointCount(design: Design): number {
  const hit = splitCache.get(design.walls);
  if (hit && hit.demolished === design.demolished) return hit.count;
  const count = collinearWallChains(design).reduce((sum, chain) => sum + chain.length - 1, 0);
  splitCache.set(design.walls, { demolished: design.demolished, count });
  return count;
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
