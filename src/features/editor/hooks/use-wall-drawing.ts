import { validateWallSegment } from '../model/wall-drawing';
import { syncRooms } from '@/lib/floor-plan/room-follow';
import { splitAtJunctions } from '../model/wall-auto-split';
import { uid, type Design } from '@/lib/floor-plan/types';
import { useSegmentDrawing } from './use-segment-drawing';

export function useWallDrawing(enabled: boolean, design: React.RefObject<Design>, scale: number, snap: boolean,
  commit: (d: Design) => void, done: () => void) {
  return useSegmentDrawing(enabled, design, scale, snap, (d, a, b) => {
    validateWallSegment(d, a, b);
    const wall = { id: uid(), a, b, kind: 'partition' as const, thickness: d.thickness };
    // 按交接点分割墙段只改墙段划分、不改墙体足迹；房间随后由「墙 + 分隔线」重算。
    commit(syncRooms(d, splitAtJunctions({ ...d, walls: [...d.walls, wall] }, wall.id)));
  }, done);
}
