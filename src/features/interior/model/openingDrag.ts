import { length } from './geometry';
import { editSelection } from './selectionEdits';
import type { Design, Point } from './types';

/** Move from the original grab point, constrained to the opening's own wall. */
export function dragOpening(before: Design, id: string, start: Point, point: Point): Design | null {
  const opening = before.openings.find(o => o.id === id);
  const wall = before.walls.find(w => w.id === opening?.wallId);
  if (!opening || !wall) return null;
  const wallLength = length(wall);
  if (!wallLength || opening.width > wallLength) return null;
  const delta = ((point[0] - start[0]) * (wall.b[0] - wall.a[0]) +
    (point[1] - start[1]) * (wall.b[1] - wall.a[1])) / wallLength;
  const offset = Math.max(opening.width / 2, Math.min(wallLength - opening.width / 2, opening.offset + delta));
  try {
    return editSelection(before, { kind: 'opening', id }, { offset });
  } catch (error) {
    if (error instanceof Error) return null;
    throw error;
  }
}
