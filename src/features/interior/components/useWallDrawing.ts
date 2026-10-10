import { validateWallSegment } from '../model/wallDrawing';
import { rebuildRooms } from '../model/geometry';
import { splitRoomsWithWall } from '../model/roomFollow';
import { addEnclosedRooms } from '../model/roomEnclosed';
import { splitAtJunctions } from '../model/wallAutoSplit';
import { uid, type Design } from '../model/types';
import { useSegmentDrawing } from './useSegmentDrawing';

export function useWallDrawing(enabled: boolean, design: React.RefObject<Design>, scale: number, snap: boolean,
  commit: (d: Design) => void, done: () => void) {
  return useSegmentDrawing(enabled, design, scale, snap, (d, a, b) => {
    validateWallSegment(d, a, b);
    const wall = { id: uid(), a, b, kind: 'partition' as const, thickness: d.thickness };
    const added = { ...d, walls: [...d.walls, wall] };
    // 房间先按完整的新墙切分，再按交接点分割墙段：分割只改墙段划分、不改墙体足迹，房间仍然成立。
    const rooms = d.template === 'blank' ? added : splitRoomsWithWall(added, wall.id);
    const next = splitAtJunctions(rooms, wall.id);
    // 非空白户型：新墙围出的、不属于任何房间的区域补成新房间。
    commit(next.template === 'blank' ? rebuildRooms(next) : addEnclosedRooms(next));
  }, done);
}
