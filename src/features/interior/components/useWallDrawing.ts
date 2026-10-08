import { validateWallSegment } from '../model/wallDrawing';
import { rebuildRooms } from '../model/geometry';
import { uid, type Design } from '../model/types';
import { useSegmentDrawing } from './useSegmentDrawing';

export function useWallDrawing(enabled: boolean, design: React.RefObject<Design>, scale: number, snap: boolean,
  commit: (d: Design) => void, done: () => void) {
  return useSegmentDrawing(enabled, design, scale, snap, (d, a, b) => {
    validateWallSegment(d, a, b);
    commit(rebuildRooms({ ...d, walls: [...d.walls, { id: uid(), a, b, kind: 'partition', thickness: d.thickness }] }));
  }, done);
}
