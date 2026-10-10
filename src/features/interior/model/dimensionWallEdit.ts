import { canResizeWall } from './wallPolicy';
import { perimeterDimensions } from './perimeterDimensions';
import { moveStructureBand } from './structureBand';
import type { Design } from './types';
import type { DimensionBinding } from './dimensionBinding';
export type FixedDimensionSide = 'start' | 'end';
const epsilon = 0.05;
const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every(id => b.includes(id));
const movable = (d: Design, ids: string[]) => ids.length > 0 && ids.every(id => d.walls.some(w => w.id === id && canResizeWall(d, w) && !d.demolished.includes(id)));
export function dimensionEditPolicy(d: Design, binding?: DimensionBinding): { reason?: string; fixed?: FixedDimensionSide; chooseSide: boolean } {
  if (!binding) return { reason: '总尺寸、墙厚或未明确对应墙体的标注仅供查看', chooseSide: false };
  const start = movable(d, binding.startWalls), end = movable(d, binding.endWalls);
  if (!start && !end) return { reason: '两侧均为承重墙或开敞边界，不能通过净距移动', chooseSide: false };
  return { fixed: !start ? 'start' : !end ? 'end' : undefined, chooseSide: start && end };
}
function bindingExists(d: Design, binding: DimensionBinding) {
  return perimeterDimensions(d)?.chains.some(chain => !chain.overall && chain.segments.some(s => s.binding &&
    s.binding.axis === binding.axis && Math.abs(s.start - binding.start) < epsilon && Math.abs(s.end - binding.end) < epsilon &&
    sameIds(s.binding.startWalls, binding.startWalls) && sameIds(s.binding.endWalls, binding.endWalls)));
}

/** Atomic structural edit: all calculations refer to the unmodified design. */
export function editDimensionWalls(before: Design, binding: DimensionBinding, requested: number, fixed: FixedDimensionSide): Design {
  const policy = dimensionEditPolicy(before, binding);
  if (policy.reason) throw new Error(policy.reason);
  if (policy.fixed && policy.fixed !== fixed) throw new Error('固定结构必须保持不动');
  if (!Number.isFinite(requested) || requested <= 0 || requested > 100000) throw new Error('请输入大于0且不超过100 m的净距离');
  if (!bindingExists(before, binding)) throw new Error('墙体或尺寸已变化，请重新选择标注');
  const updated = moveStructureBand(before, {
    axis: binding.axis, start: binding.start, end: binding.end,
    startWalls: binding.startWalls, endWalls: binding.endWalls,
  }, requested, fixed);
  if (updated === before) return before;
  const match = perimeterDimensions(updated)?.chains.flatMap(chain => chain.overall ? [] : chain.segments).find(s => s.binding &&
    s.binding.axis === binding.axis && sameIds(s.binding.startWalls, binding.startWalls) && sameIds(s.binding.endWalls, binding.endWalls));
  if (!match || Math.abs(match.end - match.start - requested) > epsilon) throw new Error('结构变化后无法得到指定净距，请检查连接关系');
  return updated;
}
