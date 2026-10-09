import polygonClipping from 'polygon-clipping';
import { bbox, inRing, inRoom, length, rect, wallPoly } from './geometry';
import { connectedWallPoly } from './wallConnections';
import type { Design, Point, Room } from './types';

/** 小于该宽度的墙端缝隙视为已封闭（mm），避免建模误差把房间判成开敞。 */
const GAP_TOLERANCE = 50;
const SAMPLE_STEP = 200;

/** 室外区域：包住全图的外框减去所有墙体后，与外框相连的那一块。 */
function outsideRegion(d: Design): Point[][] | undefined {
  const walls = d.walls.filter(w => !d.demolished.includes(w.id) && length(w) > 0.01);
  if (!walls.length) return undefined;
  // 接缝处用斜接后的墙面，另沿墙长方向各伸出一点盖住细小缝隙。
  const polys = walls.flatMap(w => [connectedWallPoly(w, d.walls, d.demolished), wallPoly(w, GAP_TOLERANCE / 2)]);
  const box = bbox(polys.flat());
  const frame = rect(box.x - 1000, box.y - 1000, box.x2 - box.x + 2000, box.y2 - box.y + 2000);
  const regions = polygonClipping.difference([frame], ...polys.map(p => [p])) as Point[][][];
  const probe: Point = [box.x - 500, box.y - 500];
  return regions.find(region => inRing(probe, region[0]!));
}

/** 房间内部、且不落在墙体里的采样点。 */
function interiorPoints(room: Room, d: Design): Point[] {
  const b = bbox(room.rings[0]!);
  const walls = d.walls.filter(w => !d.demolished.includes(w.id) && length(w) > 0.01).map(w => wallPoly(w, GAP_TOLERANCE / 2));
  const free = (p: Point) => inRoom(p, room) && !walls.some(poly => inRing(p, poly));
  const points: Point[] = [];
  const step = Math.max(SAMPLE_STEP, Math.max(b.x2 - b.x, b.y2 - b.y) / 24);
  for (let y = b.y + step / 2; y < b.y2; y += step)
    for (let x = b.x + step / 2; x < b.x2; x += step)
      if (free([x, y])) points.push([x, y]);
  return points;
}

/** 没有被墙围住、与室外连通的房间 id。 */
export function openRoomIds(d: Design): Set<string> {
  const open = new Set<string>();
  let outside: Point[][] | undefined;
  try {
    outside = outsideRegion(d);
  } catch {
    return open;
  }
  if (!outside) return open;
  const isOutside = (p: Point) => inRing(p, outside![0]!) && !outside!.slice(1).some(hole => inRing(p, hole));
  for (const room of d.rooms) {
    if (!room.rings[0] || room.rings[0].length < 3) continue;
    if (interiorPoints(room, d).some(isOutside)) open.add(room.id);
  }
  return open;
}

/**
 * 墙体围不成闭环的区域不是房间：删掉与室外连通的房间。
 * 传入 before 时，只删这次编辑新打开的房间（编辑前就开敞的保持原样）。
 */
export function dropOpenRooms(after: Design, before?: Design): Design {
  if (!after.rooms.length) return after;
  const open = openRoomIds(after);
  if (!open.size) return after;
  const already = before ? openRoomIds(before) : new Set<string>();
  const rooms = after.rooms.filter(r => !open.has(r.id) || already.has(r.id));
  return rooms.length === after.rooms.length ? after : { ...after, rooms };
}
