import { length } from '@/lib/floor-plan/geometry';
import { MIN_OPENING_WIDTH } from './opening-placement';
import { dragStep, snapToDragStep } from './drag-step';
import { editSelection } from './selection-edits';
import type { Design, Point } from '@/lib/floor-plan/types';

/** Move from the original grab point, constrained to the opening's own wall; the clear distance to wall end A snaps to the design's drag step. */
export function dragOpening(before: Design, id: string, start: Point, point: Point): Design | null {
  const opening = before.openings.find(o => o.id === id);
  const wall = before.walls.find(w => w.id === opening?.wallId);
  if (!opening || !wall) return null;
  const wallLength = length(wall);
  if (!wallLength || opening.width > wallLength) return null;
  const delta = ((point[0] - start[0]) * (wall.b[0] - wall.a[0]) +
    (point[1] - start[1]) * (wall.b[1] - wall.a[1])) / wallLength;
  // 按步进取整「洞口边到墙 A 端的净距」，让拖动时显示的距离读数是整步进。
  const edge = snapToDragStep(opening.offset + delta - opening.width / 2, dragStep(before));
  const offset = Math.max(opening.width / 2, Math.min(wallLength - opening.width / 2, edge + opening.width / 2));
  try {
    return editSelection(before, { kind: 'opening', id }, { offset });
  } catch (error) {
    if (error instanceof Error) return null;
    throw error;
  }
}

/** 洞口两端点手柄的拖拽：拖哪一端哪一端跟随指针，另一端与洞口中心不变。 */
export function dragOpeningEdge(before: Design, id: string, end: 'a' | 'b', point: Point): Design | null {
  const opening = before.openings.find(o => o.id === id);
  const wall = before.walls.find(w => w.id === opening?.wallId);
  if (!opening || !wall) return null;
  const L = length(wall);
  if (!L) return null;
  // 指针投影到墙上的位置（沿墙距离），按步进取整。
  const ux = (wall.b[0] - wall.a[0]) / L, uy = (wall.b[1] - wall.a[1]) / L;
  const at = snapToDragStep((point[0] - wall.a[0]) * ux + (point[1] - wall.a[1]) * uy, dragStep(before));
  const fixed = end === 'a' ? opening.offset + opening.width / 2 : opening.offset - opening.width / 2;
  const start = Math.max(0, Math.min(fixed, at)), stop = Math.min(L, Math.max(fixed, at));
  const width = stop - start;
  if (width < MIN_OPENING_WIDTH) return null;
  try {
    // 同时改 宽度 + 中心：两端的净距都不跳，拖起来哪端就在哪端。
    return editSelection(before, { kind: 'opening', id }, { width, offset: (start + stop) / 2 });
  } catch (error) {
    if (error instanceof Error) return null;
    throw error;
  }
}
