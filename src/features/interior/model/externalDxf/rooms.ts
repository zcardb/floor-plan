import polygonClipping from 'polygon-clipping';
import { bbox, inRing, rect, ringArea } from '../geometry';
import { connectedWallPoly } from '../wallConnections';
import { uid, type Point, type Room, type Wall } from '../types';
import { boundsOf, normalOf } from './vector';
import { distance } from '../vector';

const MIN_ROOM_AREA = 1e6;
const MAX_RING_POINTS = 1000;

const open = (ring: Point[]) => {
  const first = ring[0], last = ring[ring.length - 1];
  return ring.length > 1 && first[0] === last[0] && first[1] === last[1] ? ring.slice(0, -1) : ring;
};

/**
 * 从包住整张图的外框里减去所有墙体：和外框连着的那一块是室外，其余被墙围住的区域就是房间。
 * 同时返回挨着室外的墙（外围墙）。
 */
export function enclosedRooms(walls: Wall[]): { rooms: Room[]; exterior: Set<string> } {
  const polys = walls.map(w => connectedWallPoly(w, walls));
  const box = boundsOf(polys.flat());
  const frame = rect(box.x - 1000, box.y - 1000, box.x2 - box.x + 2000, box.y2 - box.y + 2000);
  let regions: Point[][][];
  try {
    regions = polygonClipping.difference([frame], ...polys.map(p => [p])) as Point[][][];
  } catch {
    throw new Error('墙体几何过于复杂，无法计算房间，请简化图纸后重试');
  }
  const probe: Point = [box.x - 500, box.y - 500];
  const outside = regions.find(region => inRing(probe, region[0]));
  const isOutside = (p: Point) => !!outside && inRing(p, outside[0]) && !outside.slice(1).some(hole => inRing(p, hole));
  const rooms: Room[] = regions
    .filter(region => region !== outside)
    .map(region => region.map(open))
    .filter(rings => ringArea(rings[0]) - rings.slice(1).reduce((s, hole) => s + ringArea(hole), 0) > MIN_ROOM_AREA && rings.every(r => r.length >= 3 && r.length <= MAX_RING_POINTS))
    .sort((x, y) => bbox(x[0]).y - bbox(y[0]).y || bbox(x[0]).x - bbox(y[0]).x)
    .map((rings, i) => ({ id: uid(), name: '房间 ' + (i + 1), rings, mat: 'wood' }));
  const exterior = new Set<string>();
  for (const wall of walls) {
    const L = distance(wall.a, wall.b), u: Point = [(wall.b[0] - wall.a[0]) / L, (wall.b[1] - wall.a[1]) / L], n = normalOf(u);
    const reach = wall.thickness / 2 + 30;
    if ([0.25, 0.5, 0.75].some(k => [1, -1].some(side =>
      isOutside([wall.a[0] + u[0] * L * k + n[0] * reach * side, wall.a[1] + u[1] * L * k + n[1] * reach * side]))))
      exterior.add(wall.id);
  }
  return { rooms, exterior };
}
