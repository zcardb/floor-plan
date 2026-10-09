import { validateWallSegment } from '../model/wallDrawing';
import { rebuildRooms } from '../model/geometry';
import { splitRoomsWithWall } from '../model/roomFollow';
import { uid, type Design } from '../model/types';
import { useSegmentDrawing } from './useSegmentDrawing';

export function useWallDrawing(enabled: boolean, design: React.RefObject<Design>, scale: number, snap: boolean,
  commit: (d: Design) => void, done: () => void) {
  return useSegmentDrawing(enabled, design, scale, snap, (d, a, b) => {
    validateWallSegment(d, a, b);
    const wall = { id: uid(), a, b, kind: 'partition' as const, thickness: d.thickness };
    const next = { ...d, walls: [...d.walls, wall] };
    commit(d.template === 'blank' ? rebuildRooms(next) : splitRoomsWithWall(next, wall.id));
  }, done);
}
