import { inRoom, length } from './geometry';
import { formatMeters } from './lengthUnits';
import { wallKindName } from './wallPolicy';
import type { Design, Point, Wall } from './types';

/** 两侧采样点离墙中线的额外距离（毫米），避开墙体本身。 */
const probe = 200;

/** 墙两侧的房间名（去重，最多两个）。 */
export function roomsBesideWall(design: Design, wall: Wall): string[] {
  const L = length(wall);
  if (L <= 0) return [];
  const mid: Point = [(wall.a[0] + wall.b[0]) / 2, (wall.a[1] + wall.b[1]) / 2];
  const n: Point = [-(wall.b[1] - wall.a[1]) / L, (wall.b[0] - wall.a[0]) / L];
  const reach = wall.thickness / 2 + probe;
  const names: string[] = [];
  for (const sign of [1, -1]) {
    const p: Point = [mid[0] + n[0] * reach * sign, mid[1] + n[1] * reach * sign];
    const room = design.rooms.find(r => inRoom(p, r));
    if (room && !names.includes(room.name)) names.push(room.name);
  }
  return names;
}

/** 给用户看的墙名：类型 + 两侧房间；找不到房间时用长度区分。 */
export function wallDisplayName(design: Design, wall: Wall): string {
  const rooms = roomsBesideWall(design, wall);
  return `${wallKindName(wall)} · ${rooms.length ? rooms.join(' / ') : `长 ${formatMeters(length(wall))} m`}`;
}
